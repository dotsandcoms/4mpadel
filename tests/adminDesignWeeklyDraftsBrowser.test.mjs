import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';

const fixtureUrl = 'http://weekly-calendar.fixture.invalid/';
const fixture = String.raw`
  import { createRoot } from 'react-dom/client';
  import { MemoryRouter } from 'react-router-dom';
  import { Toaster } from 'sonner';
  import { supabase } from './src/supabaseClient';
  import CalendarWorkspace from './src/pages/admin-preview/CalendarWorkspace.jsx';
  import './src/pages/AdminPreview.css';

  const user = { id: 'fixture-actor', email: 'calendar@example.invalid' };
  const result = data => ({ data, error: null });
  const drafts = new Map();
  const rows = [];
  window.calls = [];
  window.publicRows = rows;
  Object.assign(supabase, {
    auth: { getUser: async () => result({user}), getSession: async () => result({session:{user}}),
      onAuthStateChange: () => ({data:{subscription:{unsubscribe(){}}}}) },
    from(table) {
      let records = table === 'calendar' ? rows : table === 'admin_sidebar_permissions'
        ? [{email:user.email, role:'super_admin'}] : [];
      const selection = {
        select(){return selection;}, not(){return selection;}, order(){return selection;}, limit(){return selection;},
        ilike(){return selection;}, in(){return selection;}, range(){return selection;}, abortSignal(){return selection;},
        eq(key,value){records=records.filter(row=>row[key]===value); return selection;},
        maybeSingle:async()=>result(records[0]), single:async()=>result(records[0]),
        then(resolve){return Promise.resolve(result(records)).then(resolve);},
      };
      return selection;
    },
    async rpc(name, args = {}) {
      if (name !== 'admin_weekly_event_draft') return result(true);
      window.calls.push(args);
      const { p_action, p_fields, p_weeks, p_revision, p_id } = args;
      if (p_action === 'list') return result([...drafts.values()]);
      if (p_action === 'load') return result(drafts.get(p_id));
      if (p_action === 'discard') { drafts.delete(p_id); return result({id:p_id}); }
      if (p_action === 'publish') {
        drafts.delete(p_id);
        const published_ids = Array.from({length:p_weeks}, (_, index) => index + 101);
        rows.push(...published_ids.map(id => ({...p_fields,id})));
        return result({id:p_id,published_ids});
      }
      const draft = {id:p_id,name:p_fields.event_name,start_date:p_fields.start_date,organisation_id:null,
        weeks:p_weeks,revision:p_revision+1,fields:p_fields};
      drafts.set(p_id,draft);
      return result(draft);
    },
  });
  const root = createRoot(document.getElementById('root'));
  window.render = platform => root.render(<MemoryRouter><Toaster/><CalendarWorkspace client={supabase}
    session={{user}} permissions={{role:platform?'super_admin':'custom', allowed_tabs:['calendar']}}
    scopeId="all" canManageEvents={platform}/></MemoryRouter>);
`;

async function click(page, text) {
  try {
    const button = await page.waitForFunction(label => [...document.querySelectorAll('button')]
      .find(node => !node.disabled && node.getClientRects().length && node.textContent.trim() === label), {polling:50}, text);
    try { await button.evaluate(node => node.click()); }
    finally { await button.dispose(); }
  } catch (error) {
    const details = await page.evaluate(() => ({ editor:document.querySelector('.ap-live-event-editor')?.innerText.slice(0, 850),
      body:document.body.innerText.slice(0,300), rows:window.publicRows?.length, actions:window.calls?.map(call=>call.p_action) }));
    throw new Error(`Could not click ${text}. ${JSON.stringify(details)}`, { cause: error });
  }
}

test('Calendar saves, resumes, publishes and discards weekly series through the real editor', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'fourm-calendar-weekly-draft-'));
  let browser;
  const pageErrors = [];
  try {
    const js = join(dir,'fixture.js');
    await build({ stdin:{contents:fixture,loader:'jsx',resolveDir:process.cwd()}, bundle:true,
      format:'iife', platform:'browser', jsx:'automatic', outfile:js, define:{'import.meta.env':'{}'},
      plugins:[{ name:'local-calendar-fixture', setup(builder) {
        builder.onResolve({filter:/\/supabaseClient(?:\.js)?$/},() => ({path:'fake-supabase',namespace:'fixture'}));
        builder.onLoad({filter:/.*/,namespace:'fixture'},() => ({contents:'export const supabase={}; export const isSupabaseConfigured=()=>false;'}));
      } }],
    });
    browser = await puppeteer.launch({headless:true, protocolTimeout:20000, args:[
      '--no-sandbox', '--unsafely-treat-insecure-origin-as-secure=' + new URL(fixtureUrl).origin,
    ]});
    const page = await browser.newPage();
    const wait = predicate => page.waitForFunction(predicate, {polling:50});
    page.on('pageerror', problem => pageErrors.push(problem.message));
    page.setDefaultTimeout(7500);
    await page.emulateTimezone('Africa/Johannesburg');
    await page.setRequestInterception(true);
    page.on('request', request => request.url() === fixtureUrl
      ? request.respond({contentType:'text/html',body:'<main id="root"></main>'}) : request.abort());
    await page.goto(fixtureUrl);
    await page.addStyleTag({path:join(dir,'fixture.css')});
    await page.addScriptTag({path:js});
    await page.evaluate(() => {
      window.toasts = new Set();
      new MutationObserver(() => document.querySelectorAll('[data-sonner-toast]').forEach(node => window.toasts.add(node.textContent)))
        .observe(document.body, {childList:true,subtree:true,characterData:true});
    });
    await page.evaluate(() => window.render(false));
    await wait(() => document.body.textContent.includes('Preview create event'));
    assert.equal(await page.evaluate(() => document.body.textContent.includes('Weekly drafts')), false);
    await page.evaluate(() => window.render(true));

    const set = async (selector, value) => {
      await page.waitForSelector(selector, {visible:true});
      await page.$eval(selector, (node, next) => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(node, next);
        node.dispatchEvent(new Event('input', {bubbles:true}));
        node.dispatchEvent(new Event('change', {bubbles:true}));
      }, value);
    };
    const create = async name => {
      await click(page,'Create event');
      await page.locator('::-p-text(Weekly social event)').click();
      await set('[name=event_name]',name);
      await set('[name=contact_details]','Synthetic host');
      await set('[name=organiser_email]','host@example.invalid');
      await click(page,'Date & Venue');
      await set('[name=start_date]','2035-03-02');
      await set('[name=weekly_count]','4');
      await set('input[placeholder="Select a club or type a venue"]','Test venue');
      await click(page,'Add “Test venue”');
      await set('[name=city]','Cape Town');
      await click(page,'Save draft');
      await wait(() => !document.querySelector('.ap-live-event-editor')).catch(async error => {
        const detail = await page.evaluate(() => [...window.toasts, ...[...document.querySelectorAll('[role=alert], .ap-live-event-editor [role=status]')]
          .map(node => node.textContent)].join(' '));
        throw new Error(`Waiting for the saved weekly editor to close. ${detail}`, { cause: error });
      });
    };

    await create('Friday Social');
    assert.equal(await page.evaluate(() => window.publicRows.length), 0);
    const [saved] = await page.evaluate(() => window.calls);
    assert.equal(saved.p_action, 'save');
    assert.equal(saved.p_weeks, 4);
    assert.equal(saved.p_fields.entry_fee, null);
    assert.equal('p_code' in saved, false);
    await click(page,'Weekly drafts');
    await wait(() => document.body.textContent.includes('4 weeks'));
    await click(page,'Continue draft');
    await click(page,'Date & Venue');
    await page.waitForSelector('[name=weekly_count]', {visible:true});
    assert.equal(await page.$eval('[name=weekly_count]',input=>input.value),'4');
    assert.equal(await page.$eval('[name=event_name]',input=>input.value),'Friday Social');
    await click(page,'Next');
    await click(page,'Entry & Payment Settings');
    await set('input[placeholder="e.g. 150"]','120');
    await click(page,'Review & Publish');
    await click(page,'Publish event');
    await wait(() => window.publicRows.length === 4).catch(async error => {
      const detail = await page.evaluate(() => ({ toasts:[...window.toasts], actions:window.calls.map(call=>call.p_action) }));
      throw new Error(`Waiting for the four published weeks. ${JSON.stringify(detail)}`, { cause:error });
    });
    await wait(() => !document.querySelector('.ap-live-event-editor'));
    const published = await page.evaluate(() => window.calls.find(call => call.p_action === 'publish'));
    assert.equal(published.p_id,saved.p_id);
    assert.equal(published.p_weeks,4);
    assert.equal(published.p_revision,1);
    assert.equal(published.p_fields.entry_fee,120);

    await create('Second draft');
    await click(page,'Weekly drafts');
    await click(page,'Discard');
    await click(page,'Keep draft');
    assert.equal(await page.evaluate(() => window.calls.some(call => call.p_action === 'discard')),false);
    await click(page,'Discard');
    await click(page,'Confirm discard');
    await wait(() => document.body.textContent.includes('No weekly drafts to continue.'));
    assert.equal(await page.evaluate(() => window.publicRows.length),4);
  } catch (error) {
    if (pageErrors.length) throw new Error(`${error.message}\nBrowser errors: ${pageErrors.join(', ')}`, {cause:error});
    throw error;
  } finally {
    await browser?.close();
    await rm(dir,{recursive:true,force:true});
  }
});
