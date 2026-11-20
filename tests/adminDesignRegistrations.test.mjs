import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';

const directory = await mkdtemp(path.join(tmpdir(), '4m-registration-workspace-'));
const script = path.join(directory, 'registrations.js');
let browser;

const synthetic = `
const session = { user: { id: 'operator', email: 'owner@example.invalid' } };
const events = [
  { id: 11, organisation_id: 'north', event_name: 'North Open', is_manual: true },
  { id: 12, organisation_id: 'north', event_name: 'North RankedIn', is_manual: false },
  { id: 21, organisation_id: 'south', event_name: 'South Open', is_manual: true },
];
const registration = (id, eventId, name, extra) => ({ id, event_id: eventId, full_name: name, email: id + '@example.invalid',
    status:'registered', payment_status:'pending', division:'Open', division_id:51, created_at:'2034-12-07', whatsapp_added:false, ...extra });
const registrations = [
  registration('alpha', 11, 'Alpha Player', { payment_status:'paid', payment_method:'eft', whatsapp_added: null }),
  registration('beta', 11, 'Beta Player', { status:'needs_review', division:'Advanced', division_id:52 }),
  registration('zulu', 11, 'Zulu Player', { payment_status:'failed', created_at:'2035-01-01' }),
  registration('withdrawn', 11, 'Former Player', { status:'withdrawn', payment_status:'refunded' }),
  registration('south', 21, 'South confidential player', {}),
  ...Array.from({length: 49}, (_, index) => registration('filler'+index, 11, 'Filler '+String(index).padStart(2,'0'), {})),
];
const receipt = { id:'manual-1', event_id:11, payment_type:'event_entry_fee', status:'success', payment_method:'eft', amount:700,
    reference:'MANUAL-ADMIN-alpha', metadata:{ registration_id:'alpha', source:'manual_event_admin', collection_recipient_name:'North Tennis', payment_note:'Bank transfer checked' } };
const tables = {
  calendar: events,
  event_registrations: registrations,
  tournament_divisions: [{id:51,event_id:11,name:'Open'}, {id:52,event_id:11,name:'Advanced'}, {id:80,event_id:21,name:'South Only'}],
  players: [{id:31,name:'Alpha on file',email:'alpha@example.invalid',contact_number:'+27 12 345 6789'}, {id:41,name:'Synthetic Replacement',email:'replacement@example.invalid'},
    {id:71,name:'South private profile',email:'south@example.invalid'}],
  payments: [receipt, { ...receipt, id:'paystack-zulu', payment_method:'paystack', reference:'PAYSTACK-ZULU', metadata:{registration_id:'zulu'} }, { ...receipt, id:'south-money', event_id:21, reference:'SOUTH-PRIVATE' }],
  payment_refunds: [
    { id:'zulu-refund', event_registration_id:'zulu', payment_id:'paystack-zulu', status:'failed', amount:125, reason:'admin_removal', metadata:{verify_failed:true} },
    { id:'alpha-refund', event_registration_id:'alpha', payment_id:'manual-1', status:'failed', amount:100, reason:'admin_removal' },
    { id:'wrong-payment', event_registration_id:'alpha', payment_id:'south-money', status:'failed', amount:999, reason:'admin_removal' },
  ],
};
const result = data => ({ data, error: null });
window.requests = [];
window.downloads = [];
window.setStale = () => { registrations.find(row=>row.id==='alpha').whatsapp_added = true; };
const click = HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click = function () {
  if (this.download) { window.downloads.push(this.download); return; }
  return click.call(this);
};
const client = {
  functions: { async invoke(name, {body}) {
    window.requests.push(['edge',name,body]);
    const refund = tables.payment_refunds.find(row=>row.id===body.payment_refund_id);
    if (name!=='paystack-refund' || !refund || body.event_id!==11 || body.reviewed_registration_id!=='zulu' || 'registration_id' in body || window.fixtureRole!=='platform') return {error:{}};
    if (body.action==='reviewed_retry_failed') {
      refund.status='needs_attention'; refund.metadata={...refund.metadata,reviewed_retry:{phase:'held',method:'paystack',reference:'4m-refund-fixture'}};
      return {data:null,error:{context:new Response(JSON.stringify({error:'Refund outcome is unconfirmed. The refund remains held for Paystack reconciliation.'}))}};
    }
    if (body.action==='reconcile_retry') {
      refund.status='processed'; refund.metadata.reviewed_retry.phase='verified';
      return result({status:'processed'});
    }
    return {error:{}};
  } },
  auth: { getUser: async () => result({user:session.user}) },
  rpc(name, args) {
    window.requests.push(['rpc',name,args]);
    let data = null;
    if (name==='can_manage_event') data = args.p_event_id===11 && window.fixtureRole!=='viewer';
    if (name==='is_super_admin') data = window.fixtureRole==='platform';
    if (name==='account_is_active') data = true;
    if (name==='event_license_status') data = args.p_player_ids.map(id=>({player_id:id, eligibility:{full:id===31,temporary:id===41}}));
    if (name==='find_registration_partner') data = [tables.players[1]];
    if (name==='replace_registration_player') {
      const row = registrations.find(row => row.id === args.p_registration_id);
      const player = tables.players.find(row => row.id === args.p_new_player_id);
      if (row && player && row.email===args.p_expected_email) {
        row.full_name=player.name; row.email=player.email;
        data = {registration_id:row.id,new_name:player.name,new_email:player.email};
      }
    }
    const request = Promise.resolve(result(data));
    request.abortSignal = () => request;
    return request;
  },
  from(table) {
    const conditions = [];
    const matching = [];
    let single = false, range = null, update = null;
    const query = {
      select() { return query; }, order() { return query; }, abortSignal() { return query; },
      eq(key, value) { conditions.push([key,value]); matching.push(row=>row[key] != null && String(row[key])===String(value)); return query; },
      is(key, value) { conditions.push([key,value]); matching.push(row=>row[key]===value); return query; },
      in(key, values) { conditions.push([key,values]); matching.push(row=>values.includes(row[key])); return query; },
      or(expression) { matching.push(row=>expression.includes('"'+row.email+'"')); return query; },
      range(start,end) { range=[start,end+1]; return query; },
      update(value) { update=value; return query; },
      single() { single=true; return query; }, maybeSingle() { return query.single(); },
      then(resolve, reject) {
        const found = (tables[table] || []).filter(row=>matching.every(fn=>fn(row)));
        const rows = range ? found.slice(...range) : found;
        window.requests.push([update?'write':'read',table,conditions,...(update?[update]:[])]);
        if (update) rows.forEach(row => Object.assign(row,update));
        const data = rows.map(row=>({...row}));
        return Promise.resolve(result(single ? data[0] || null : data)).then(resolve,reject);
      },
    };
    return query;
  },
};
`;

before(async () => {
  await build({ stdin: { resolveDir: process.cwd(), loader: 'jsx', contents: `
    import { createRoot } from 'react-dom/client';
    import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
    import RegistrationsWorkspace from './src/pages/admin-preview/RegistrationsWorkspace.jsx';
    import { loadRegistrationWorkspace } from './src/pages/admin-preview/registrationWorkspaceData.js';
    import './src/pages/AdminPreview.css';
    ${synthetic}
    window.supabaseFixture = client;
    function App() {
      const location = useLocation(), navigate = useNavigate();
      const values = new URLSearchParams(location.search);
      const scopeId = window.fixtureRole === 'platform' ? 'all' : 'org:north';
      const go = (page, payload = {}) => navigate('/admin-preview/'+page+(payload.event ? '?'+new URLSearchParams({ event:payload.event.id, ...(payload.registration ? { registration:payload.registration.id } : {}) }) : ''));
      const scopedEvents = scopeId==='all' ? events : events.filter(event=>event.organisation_id==='north');
      return <div className="ap-root"><main className="ap-main"><output hidden>{location.pathname+location.search}</output>
        {location.pathname.endsWith('/registrations') && <RegistrationsWorkspace client={client} session={session} scopeId={scopeId} events={scopedEvents}
          eventId={values.get('event')} initialRegistrationId={values.get('registration')} canReadLedger={scopeId==='all'} canOpenMessages canOpenPlayer={scopeId==='all'} go={go}/>}</main></div>;
    }
    window.start = (role, route) => { window.fixtureRole=role; createRoot(document.querySelector('#fixture')).render(<MemoryRouter initialEntries={[route]}><App /></MemoryRouter>); };
    window.loadOutside = () => loadRegistrationWorkspace({client,expectedUserId:session.user.id,eventId:21,scopeId:'org:north',canReadLedger:true}).then(()=>true,error=>error.message);
  ` }, jsx: 'automatic', outfile: script, bundle: true, platform: 'browser', format: 'iife', define: { 'import.meta.env': '{}' },
  loader: { '.svg': 'dataurl', '.png': 'dataurl', '.jpg': 'dataurl', '.woff2': 'dataurl' },
  plugins: [{ name: 'registration-synthetic-only', setup(plugin) {
    plugin.onResolve({ filter: /\/supabaseClient(?:\.js)?$/ }, () => ({ path: 'supabase', namespace: 'synthetic-only' }));
    plugin.onLoad({ filter: /.*/, namespace: 'synthetic-only' }, () => ({ contents: `export const supabase = new Proxy({}, { get: (_target,key) => window.supabaseFixture[key] });` }));
  } }], });
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'], protocolTimeout: 20000 });
});

after(async () => { await browser?.close(); await rm(directory, { recursive: true, force: true }); });

async function open(t, role = 'tenant', route = '/admin-preview/registrations?event=11') {
  const page = await browser.newPage();
  t.after(() => page.close());
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  await page.setViewport({ width: 1440, height: 1000 });
  page.setDefaultTimeout(6000);
  await page.setRequestInterception(true);
  page.on('request', request => request.url() === 'http://fixture.invalid/'
    ? request.respond({ contentType: 'text/html', body: '<!doctype html><meta name="viewport" content="width=device-width"><div id="fixture"></div>' }) : request.abort());
  await page.goto('http://fixture.invalid/');
  await page.addStyleTag({ path: script.replace(/\.js$/, '.css') });
  await page.addScriptTag({ path: script });
  await page.evaluate((role, route) => window.start(role, route), role, route);
  return page;
}

async function clickText(page, scope, label) {
  try {
    await page.waitForFunction((scope, label) => Array.from(document.querySelectorAll(scope)).some(node => node.getClientRects().length && node.textContent.trim() === label), {}, scope, label);
    await page.evaluate((scope, label) => Array.from(document.querySelectorAll(scope)).find(node => node.getClientRects().length && node.textContent.trim() === label).click(), scope, label);
  } catch (error) { throw new Error('Could not click ' + label, { cause: error }); }
}

async function choose(page, label, option) {
  await click(page, `button[aria-label="${label}"]`);
  await clickText(page, '[role="option"] span:first-child', option);
}

const bodyText = (page, text) => page.waitForFunction(text => document.body.innerText.includes(text), {}, text).catch(async error => { throw new Error('Missing ' + text + ': ' + (await page.$eval('dialog[open]', node => node.innerText).catch(() => 'no dialog')), { cause: error }); });
const drawer = (page, name) => page.waitForFunction(name => document.querySelector('.ap-drawer h2')?.textContent === name, {}, name);
const routeTo = (page, route) => page.waitForFunction(route => document.querySelector('output')?.textContent === route, {}, route);

const click = (page, selector) => page.$eval(selector, node => node.click());
const input = (page, selector, value) => page.$eval(selector, (element, value) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
}, value);

async function checkRows(page, expected) {
  await page.waitForFunction(expected => JSON.stringify(Array.from(document.querySelectorAll('.ap-person-cell b'), node => node.textContent)) === JSON.stringify(expected), {}, expected);
}

test('tenant filters, sorts, paginates, exports, selects and opens the original event workspaces', async t => {
  const page = await open(t);
  await bodyText(page, 'Showing 1–50 of 53');
  await clickText(page, 'nav button', 'Next');
  await bodyText(page, 'Showing 51–53 of 53');
  await page.waitForFunction(() => document.querySelectorAll('.ap-person-cell').length === 3);
  await clickText(page, 'nav button', 'Previous');
  await clickText(page, '.ap-filter-tabs button', 'Needs review');
  await checkRows(page, ['Beta Player']);
  await clickText(page, '.ap-filter-tabs button', 'Payment issues');
  await bodyText(page, 'of 51');
  await clickText(page, '.ap-filter-tabs button', 'Paid');
  await checkRows(page, ['Alpha Player']);
  await clickText(page, '.ap-filter-tabs button', 'All states');
  await choose(page, 'Filter by recorded payment', 'Withdrawn');
  await checkRows(page, ['Former Player']);
  await choose(page, 'Filter by recorded payment', 'All payment states');
  await choose(page, 'Filter by registration licence', 'Full licence');
  await checkRows(page, ['Alpha Player']);
  await choose(page, 'Filter by registration licence', 'All licences');
  await choose(page, 'Filter registration division', 'Advanced');
  await checkRows(page, ['Beta Player']);
  await choose(page, 'Filter registration division', 'All divisions');
  await choose(page, 'Sort registrations', 'Most recent');
  await page.waitForFunction(() => document.querySelector('.ap-person-cell b')?.textContent==='Zulu Player');
  await input(page, '.ap-filter-search input', 'alpha@example.invalid');
  await checkRows(page, ['Alpha Player']);
  await clickText(page, '.ap-heading-actions button', 'Export view');
  await click(page, '[aria-label="Select all registrations on this page"]');
  await bodyText(page, '1 selected');
  await clickText(page, '.ap-bulk-bar button', 'Export selected');
  assert.deepEqual(await page.evaluate(() => window.downloads), ['4m-registrations-11.csv','4m-registrations-11.csv']);
  await clickText(page, '.ap-bulk-bar button', 'Clear selection');
  await click(page, '[aria-label="Open Alpha Player registration"]');
  await drawer(page, 'Alpha Player');
  assert.equal(await page.$eval('.ap-drawer a[href^="tel:"]', link => link.getAttribute('href')), 'tel:+27123456789');
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  await page.waitForSelector('.ap-drawer',{hidden:true});
  await input(page, '.ap-filter-search input', 'no matching name');
  await clickText(page, '.ap-empty button', 'Clear filters');
  await bodyText(page, 'Showing 1–50 of 53');
  await choose(page, 'Registration event', 'North RankedIn');
  await routeTo(page, '/admin-preview/registrations?event=12');
  await clickText(page, 'a.ap-primary', 'Open imported participants');
  await routeTo(page, '/admin-preview/event?event=12');
});

test('tenant group and replacement controls use exact event authority and preserve an unrelated tenant', async t => {
  const page = await open(t,'tenant','/admin-preview/registrations?event=11&registration=alpha');
  await drawer(page, 'Alpha Player');
  assert.doesNotMatch(await page.$eval('body', body => body.innerText), /South confidential|SOUTH-PRIVATE/);
  assert.equal(await page.evaluate(() => window.requests.some(call=>['payments','payment_refunds'].includes(call[1]))),false);
  assert.match(await page.evaluate(() => window.loadOutside()), /outside the selected workspace/);
  await clickText(page, '.ap-drawer button', 'Update group record');
  await clickText(page, 'dialog button', 'Cancel');
  assert.equal(await page.evaluate(() => window.requests.filter(call => call[0]==='write').length), 0);
  await clickText(page, '.ap-drawer button', 'Update group record');
  await clickText(page, 'dialog button', 'Save group record');
  await bodyText(page, 'WhatsApp group record updated for Alpha Player.');
  await clickText(page, 'dialog button', 'Done');
  await bodyText(page, 'Recorded on group');
  assert.deepEqual(await page.evaluate(() => window.requests.filter(call => call[0]==='write')), [[
    'write','event_registrations',[['event_id',11],['id','alpha'],['status','registered'],['whatsapp_added',null]],{whatsapp_added:true},
  ]]);
  await clickText(page, '.ap-drawer button', 'Replace player / Change profile');
  await input(page, 'dialog .ap-event-player-search input[type="search"]', 'Synthetic');
  await page.waitForSelector('dialog .ap-event-player-search ul button');
  assert.equal(await page.$eval('dialog .ap-event-player-search ul button b', node => node.textContent), 'Synthetic Replacement');
  await click(page, 'dialog .ap-event-player-search ul button');
  await clickText(page, 'dialog button', 'Confirm replacement');
  await page.waitForFunction(() => document.querySelector('dialog p[role="status"]')?.textContent === 'Synthetic Replacement has taken over this entry.', { polling: 'mutation' });
  await clickText(page, 'dialog button', 'Done');
  await drawer(page, 'Synthetic Replacement');
  assert.deepEqual(await page.evaluate(() => window.requests.find(call => call[1]==='replace_registration_player')?.[2]),
    {p_registration_id:'alpha',p_expected_email:'alpha@example.invalid',p_expected_partner_email:null,p_new_player_id:41});
  await clickText(page, '.ap-drawer a', 'Manage this entry');
  await routeTo(page, '/admin-preview/event?event=11&registration=alpha');
});

test('stale WhatsApp and unlisted events fail before a mutation; platform receipt details stay exact', async t => {
  const platform = await open(t,'platform','/admin-preview/registrations?event=11&registration=alpha');
  await drawer(platform, 'Alpha Player');
  await bodyText(platform, 'Bank transfer checked');
  await bodyText(platform, 'North Tennis');
  await bodyText(platform, 'admin removal');
  assert.doesNotMatch(await platform.$eval('.ap-drawer', item => item.innerText), /999|SOUTH-PRIVATE|Retry refund/);
  await click(platform, '.ap-drawer button.ap-linked-record');
  await routeTo(platform, '/admin-preview/player?event=11&registration=alpha');

  const stale = await open(t,'tenant','/admin-preview/registrations?event=11&registration=alpha');
  await drawer(stale, 'Alpha Player');
  await clickText(stale, '.ap-drawer button', 'Update group record');
  await stale.evaluate(() => window.setStale());
  await clickText(stale, 'dialog button', 'Save group record');
  await bodyText(stale, 'The registration changed.');
  assert.equal(await stale.evaluate(() => window.requests.filter(call => call[0]==='write').length), 0);

  const outside = await open(t, 'tenant', '/admin-preview/registrations?event=21&registration=south');
  await bodyText(outside, 'No event registrations are available');
  assert.equal(await outside.evaluate(() => window.requests.length), 0);
  const viewer = await open(t,'viewer','/admin-preview/registrations?event=11&registration=zulu');
  await drawer(viewer, 'Zulu Player');
  assert.doesNotMatch(await viewer.$eval('.ap-drawer', item => item.innerText), /Update group record|Replace player/);
  await clickText(viewer, '.ap-drawer button', 'Resolve payment');
  await routeTo(viewer, '/admin-preview/payment?event=11&registration=zulu');
});


test('platform refund review holds an unconfirmed receipt, then checks its saved reference without retrying', async t => {
  const page = await open(t,'platform','/admin-preview/registrations?event=11&registration=zulu');
  await drawer(page, 'Zulu Player');
  await clickText(page, '.ap-drawer button', 'Retry failed refund');
  await clickText(page, 'dialog button', 'Cancel');
  assert.equal(await page.evaluate(() => window.requests.filter(call=>call[0]==='edge').length),0);
  await clickText(page, '.ap-drawer button', 'Retry failed refund');
  await clickText(page, 'dialog button', 'Confirm refund retry');
  await page.waitForSelector('dialog [role="alert"]');
  assert.match(await page.$eval('dialog [role="alert"]', node=>node.textContent), /refund remains held/);
  await clickText(page, 'dialog button', 'Close');
  await clickText(page, '.ap-drawer button', 'Check Paystack status');
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('.ap-drawer button')].some(button=>button.textContent==='Retry failed refund')),false);
  await clickText(page, 'dialog button', 'Check status');
  await page.waitForSelector('dialog [role="status"]');
  assert.match(await page.$eval('dialog [role="status"]', node=>node.textContent), /recorded as processed/);
  await clickText(page, 'dialog button', 'Done');
  assert.deepEqual(await page.evaluate(() => window.requests.filter(call=>call[0]==='edge')), [
    ['edge','paystack-refund',{action:'reviewed_retry_failed',event_id:11,reviewed_registration_id:'zulu',payment_refund_id:'zulu-refund'}],
    ['edge','paystack-refund',{action:'reconcile_retry',event_id:11,reviewed_registration_id:'zulu',payment_refund_id:'zulu-refund'}],
  ]);
});
