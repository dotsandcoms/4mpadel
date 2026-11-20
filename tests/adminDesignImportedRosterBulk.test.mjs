import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';
import { applyImportedRosterBatch, bulkImportedRosterEvents, reviewImportedRosterBatch } from '../src/pages/admin-preview/importedParticipantBulkSync.js';

const session = { user: { id: 'synthetic-operator', email: 'operator@example.invalid' } };
const event = (id, rankedin_id, event_name, extra = {}) => ({ id, rankedin_id, event_name, is_manual: false, event_status: 'scheduled',
  finance_managed: true, start_date: '2035-01-01', sapa_status: 'Silver', ...extra });
const [alpha, beta, gamma, native, moved, unrelated] = [
  event(11, '301', 'Fixture Alpha'), event(12, '302', 'Fixture Beta'), event(13, '303', 'Fixture Unavailable'),
  event(14, '304', 'Fixture Native', { is_manual: true }), event(15, '305', 'Moved link'), event(16, '306', 'Unrelated event'),
];
const events = [alpha, beta, gamma, native, unrelated];
const token = 'a'.repeat(64);
const scope = { expectedUserId: session.user.id, scopeId: 'all' };

function backend({ allowed = true, stale = 0, changed = 0 } = {}) {
  const calls = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: session.user } }) },
    from(table) {
      let key;
      const query = { select: () => query, abortSignal: () => query,
        eq(_field, value) { key = Number(value); return query; },
        async single() {
          calls.push(['calendar', key]);
          assert.equal(table, 'calendar');
          const record = [...events, moved].find(row => row.id === key);
          return { data: key === changed ? { ...record, rankedin_id: '991' } : record };
        },
      };
      return query;
    },
    rpc(name, args) {
      calls.push([name, args]);
      let response = { data: name !== 'is_super_admin' || allowed };
      if (name === 'admin_import_rankedin_participants') response = !args.p_expected ? { data: { event_id: args.p_event_id, token,
        changes: [{ action: 'add', source_id: 'local-fixture', name: 'Imported Player', division: 'Open' }] } }
        : args.p_event_id === stale ? { error: { message: 'The stored roster or its payment evidence changed.' } }
          : { data: { event_id: args.p_event_id, status: 'saved', inserted: 1, updated: 0, removed: 0 } };
      const result = Promise.resolve(response);
      result.abortSignal = () => result;
      return result;
    },
  };
  const gateway = {
    async participantClasses(id) { calls.push(['classes', id]); return [{ Id: 20, Name: 'Open' }]; },
    async classParticipants(id, division) {
      calls.push(['participants', id, division]);
      if (id === '303') throw new Error('RankedIn division temporarily unavailable.');
      return [{ FirstPlayer: { Id: 200, Name: 'Imported Player' } }];
    },
  };
  return { client, gateway, calls };
}

test('batch previews exact complete rosters with no write and applies only successful reviewed rows', async () => {
  const fixture = backend({ stale: 12, changed: moved.id });
  assert.deepEqual(bulkImportedRosterEvents([alpha, native, beta, alpha, { ...gamma, event_status: 'cancelled' }]).map(row => row.id), [11,12]);
  const reviews = await reviewImportedRosterBatch({ ...fixture, ...scope, events: [alpha, beta, gamma, native, moved] });
  assert.deepEqual(reviews.map(row => [row.event.id, Boolean(row.review)]), [[11, true],[12,true],[13,false],[15,false]]);
  assert.match(reviews[2].error, /temporarily unavailable/);
  assert.match(reviews[3].error, /link changed/);
  assert.deepEqual(fixture.calls.filter(row => row[0] === 'classes').map(([,id]) => id), ['301','302','303']);
  assert.equal(fixture.calls.some(([name,args]) => name === 'admin_import_rankedin_participants' && args.p_expected), false);
  let writes = 0;
  const result = await applyImportedRosterBatch({ ...fixture, ...scope, batch: reviews.filter(row => row.review), isCurrent: () => true, onAttempt: () => writes++ });
  assert.equal(writes, 2);
  assert.deepEqual(result.saved.map(row => row.event.id), [11]);
  assert.equal(result.failures[0].event.id, 12);
  assert.match(result.failures[0].error, /payment evidence changed/);
  assert.deepEqual(fixture.calls.filter(([name,args]) => name === 'admin_import_rankedin_participants' && args.p_expected).map(([,args]) => args), [
    { p_event_id: 11, p_rankedin_id: '301', p_entries: [{ id: '200', name: 'Imported Player', division: 'Open' }], p_expected: token },
    { p_event_id: 12, p_rankedin_id: '302', p_entries: [{ id: '200', name: 'Imported Player', division: 'Open' }], p_expected: token },
  ]);
});

test('bulk import blocks tenant scopes, revoked platform role and expired reviews before writes', async () => {
  const fixture = backend();
  await assert.rejects(reviewImportedRosterBatch({ ...fixture, ...scope, scopeId: 'org:north', events: [alpha] }), /all-workspaces administrator/);
  assert.deepEqual(fixture.calls, []);
  const batch = await reviewImportedRosterBatch({ ...fixture, ...scope, events: [alpha] });
  const withdrawn = backend({ allowed: false });
  await assert.rejects(applyImportedRosterBatch({ ...withdrawn, ...scope, batch, isCurrent: () => true, onAttempt: () => assert.fail() }), /verified super-admin/);
  assert.equal(withdrawn.calls.some(([name]) => name === 'admin_import_rankedin_participants'), false);
  batch[0].review.reviewedAt = Date.now() - 3600000;
  const expired = await applyImportedRosterBatch({ ...fixture, ...scope, batch, isCurrent: () => true, onAttempt: () => assert.fail() });
  assert.match(expired.failures[0].error, /review expired/);
});

const fixtureUrl = 'http://rankedin-bulk.fixture.invalid/';
const fixtureJs = `
  import { createRoot } from 'react-dom/client';
  import Dashboard from './src/pages/admin-preview/EventManagerDashboard.jsx';
  import './src/pages/AdminPreview.css';
  const events = ${JSON.stringify(events)};
  const session = ${JSON.stringify(session)};
  const token = ${JSON.stringify(token)};
  window.fixtureCalls = [];
  window.revoked = false;
  const response = data => ({ data });
  const client = {
    auth: { getUser: async()=>response({user:session.user}) },
    rpc(name,args) {
      window.fixtureCalls.push([name,args]);
      let output;
      if (name==='is_super_admin')output=response(!window.tenant && !window.revoked);
      else if (name==='can_manage_event' || name==='account_is_active')output=response(true);
      else if (name==='admin_import_rankedin_participants')output=args.p_expected ? response({event_id:args.p_event_id,status:'saved',inserted:1,updated:0,removed:0})
        : response({event_id:args.p_event_id,token,changes:[{action:'add',name:args.p_entries[0].name,division:args.p_entries[0].division}]});
      else output=response([]);
      const query=Promise.resolve(output);query.abortSignal=()=>query;return query;
    },
    from(table) {
      let rows=table==='calendar'?events:[];
      const query={select(){return this},order(){return this},in(){return this},range(){return this},abortSignal(){return this},
        eq(key,value){rows=rows.filter(row=>String(row[key])===String(value));return this},
        async single(){return response(rows[0])},then(resolve,reject){return Promise.resolve(response(rows)).then(resolve,reject)}};
      return query;
    },
  };
  window.start = tenant => {
    window.tenant=tenant;
    createRoot(document.getElementById('root')).render(<Dashboard events={events} registrations={[]} client={client}
      session={session} scopeId={tenant?'org:north':'all'} canBulkSyncRankedin go={()=>{}} onRefresh={()=>window.fixtureCalls.push(['refresh'])}/>);
  };
`;

async function click(page, name, scope = 'button') {
  await page.waitForFunction((scope, name) => [...document.querySelectorAll(scope)].some(node => !node.disabled && node.textContent.trim() === name), { polling: 50 }, scope, name);
  await page.$eval(scope, (_node, scope, name) => [...document.querySelectorAll(scope)].find(node => !node.disabled && node.textContent.trim() === name).click(), scope, name);
}
const text = (page,value) => page.waitForFunction(value => document.body.innerText.includes(value), { polling: 50 }, value);

test('Event Manager bulk click follows the current filtered list, previews partial failures and refreshes after the confirmed import', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), '4m-bulk-roster-'));
  let browser;
  try {
    const output = path.join(directory, 'fixture.js');
    await build({ stdin: { contents: fixtureJs, loader: 'jsx', resolveDir: process.cwd() }, bundle: true, format: 'iife',
      platform: 'browser', jsx: 'automatic', outfile: output, define: { 'import.meta.env': '{}' },
      plugins: [{ name: 'synthetic-data-only', setup(builder) {
        builder.onResolve({ filter: /\/supabaseClient(?:\.js)?$/ }, () => ({ path: 'client', namespace: 'fixture' }));
        builder.onLoad({ filter: /./, namespace: 'fixture' }, () => ({ contents: 'export const supabase={};' }));
      } }],
    });
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'], protocolTimeout: 20000 });
    const open = async tenant => {
      const page = await browser.newPage();
      const requested = [], errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.setDefaultTimeout(8000);
      await page.setRequestInterception(true);
      page.on('request', request => {
        if (request.url() === fixtureUrl) return request.respond({ contentType: 'text/html', body: '<main id="root" class="ap-root"></main>' });
        const url = new URL(request.url());
        if (url.origin !== 'https://api.rankedin.com') return request.abort();
        const id = url.searchParams.get('tournamentId') || url.searchParams.get('id');
        requested.push(id);
        const headers = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
        if (url.pathname.endsWith('GetPlayersTabAsync')) return request.respond({ headers, body: JSON.stringify([{ Id: 20, Name: 'Open' }]) });
        if (id === '303') return request.respond({ headers, status: 502, body: '{}' });
        return request.respond({ headers, body: JSON.stringify({ Teams: [{ FirstPlayer: { Id: 200, Name: 'Alpha Import' }, SecondPlayer: { Id: 0 } }] }) });
      });
      await page.goto(fixtureUrl);
      await page.addStyleTag({ path: path.join(directory, 'fixture.css') });
      await page.addScriptTag({ path: output });
      await page.evaluate(tenant => window.start(tenant), tenant);
      return { page, requested, errors };
    };
    const { page, requested, errors } = await open(false);
    await page.$eval('.ap-filter-search input', node => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(node, 'Fixture');
      node.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await click(page, 'Bulk sync RankedIn rosters');
    await text(page, '3 of 3 events selected');
    assert.equal(await page.$eval('dialog', node => /Fixture Native|Unrelated event/.test(node.textContent)), false);
    await page.evaluate(() => [...document.querySelectorAll('dialog label')].find(node => node.textContent.trim() === 'Fixture Beta').querySelector('input').click());
    await click(page, 'Review selected rosters', 'dialog button');
    await text(page, '1 event has roster changes ready to apply.');
    await text(page, 'HTTP 502');
    assert.deepEqual([...new Set(requested)], ['301', '303']);
    assert.equal(await page.evaluate(() => window.fixtureCalls.some(([name,args])=>name==='admin_import_rankedin_participants' && args.p_expected)),false);
    await click(page, 'Confirm roster imports', 'dialog button');
    await text(page, '1 roster updated. 0 could not be confirmed. 1 skipped during review.');
    assert.deepEqual(await page.evaluate(() => window.fixtureCalls.filter(([name,args])=>name==='admin_import_rankedin_participants' && args.p_expected).map(([,args])=>args.p_event_id)), [11]);
    await click(page, 'Done', 'dialog button');
    assert.equal(await page.evaluate(() => window.fixtureCalls.some(([name])=>name==='refresh')), true);
    assert.deepEqual(errors, []);
    const tenant = await open(true);
    await text(tenant.page, 'Fixture Alpha');
    assert.equal(await tenant.page.evaluate(() => [...document.querySelectorAll('button')].some(node=>node.textContent.trim()==='Bulk sync RankedIn rosters')), false);
    assert.deepEqual(tenant.requested, []);
  } finally {
    await browser?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
