import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';

let browser, directory, bundle, photo;
const fixture = `
  import { createRoot } from 'react-dom/client';
  import ClubsWorkspace from './src/pages/admin-preview/ClubsWorkspace.jsx';
  window.crypto.randomUUID ??= () => '90000000-0000-4000-8000-000000000009';
  const session = { user: { id:'fixture-ops', email:'ops@example.test' } };
  let clubs = [{id:'source',name:'Source club',city:'Coast',status:'published',players:window.clubHasPlayers ? 1 : 0},
    {id:'target',name:'Destination club',city:'Inland',status:'published',players:0}];
  const snapshot = club => club ? {...club,events:1,members:1,organisations:0,claims:0,invitations:0,favourites:1,places:0} : null;
  const result = data => ({ data, error:null });
  window.clubCalls = [];
  window.clubWrites = [];
  window.clubUploads = [];
  const client = {
    auth: { getUser: async () => result({user:session.user}) },
    rpc(name,args) {
      const response = (async () => {
        if (name === 'is_super_admin') return result(!window.clubTenant && !window.clubRevoked);
        if (name === 'account_is_active') return result(true);
        if (name === 'can_manage_club') return result(args.p_club_id === 'source' && !window.clubRevoked);
        if (name !== 'manage_reviewed_club') return result([]);
        window.clubCalls.push(args);
        const source = clubs.find(row=>row.id===args.p_source), target = clubs.find(row=>row.id===args.p_target);
        if (args.p_action.startsWith('review-')) return result({source:snapshot(source),target:snapshot(target)});
        if (window.clubStale) return {error:{message:'The club or its linked records changed. Open a new review.'}};
        clubs = clubs.filter(row => row.id !== source.id);
        return result({action:args.p_action==='merge'?'merged':'deleted', source_id:source.id, source_name:source.name,
          target_id:target?.id,target_name:target?.name});
      })();
      response.abortSignal=()=>response;
      return response;
    },
    from(table) {
      let filters = {}, start = 0, end, patch;
      const data = () => (table==='clubs'?clubs:[]).filter(row=>Object.entries(filters).every(([key,value])=>(row[key]??null)===value)).slice(start,end);
      const one = async () => {
        const row = data()[0];
        if (row && patch) {
          window.clubWrites.push({id:row.id,...patch});
          clubs = clubs.map(value=>value.id===row.id?{...row,...patch}:value);
          return result(clubs.find(value=>value.id===row.id));
        }
        return result(row||null);
      };
      const query = {select(){return query;}, eq(k,v){filters[k]=v;return query;}, order(){return query;}, ilike(){return query;},
        is(k,v){filters[k]=v;return query;}, update(values){patch=values;return query;}, single:one,
        in(){return query;}, limit(){return query;}, range(first,last){start=first;end=last+1;return query;}, abortSignal(){return query;},
        maybeSingle:one, then(resolve,reject){return Promise.resolve(result(data())).then(resolve,reject);}};
      return query;
    },
    storage:{from:()=>({
      upload:async(path)=>{window.clubUploads.push(path);return result({path});},
      getPublicUrl:path=>result({publicUrl:'https://fixture.test/club/'+path}),
    })},
  };
  const permissions = window.clubTenant ? {role:'club_admin',clubs:[{id:'source',member_role:'owner'}]} : {role:'super_admin'};
  createRoot(document.getElementById('root')).render(<ClubsWorkspace session={session} client={client}
    scopeId={window.clubTenant?'club:source':'all'} permissions={permissions}/>);
`;

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'fourm-club-lifecycle-ui-'));
  bundle = join(directory, 'fixture.js');
  photo = join(directory, 'crest.png');
  await writeFile(photo, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2vQAAAAASUVORK5CYII=', 'base64'));
  await build({
    stdin: { contents: fixture, resolveDir: process.cwd(), loader: 'jsx' },
    bundle: true, outfile: bundle, format: 'iife', jsx: 'automatic', platform: 'browser', define: { 'import.meta.env': '{}' },
    plugins: [{ name: 'fixture-connector', setup(build) {
      build.onResolve({ filter: /\/(supabaseClient|googleMaps)(?:\.js)?$/ }, args => ({ path: args.path.includes('googleMaps') ? 'maps' : 'client', namespace: 'fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: args.path === 'maps'
        ? 'export const attachPlacesAutocomplete = async () => ({ destroy() {} }); export const loadGoogleMaps = async () => null;'
        : 'export const supabase = null; export const isSupabaseConfigured = () => false;' }));
    } }],
  });
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); if (directory) await rm(directory, { recursive: true, force: true }); });

async function open(t, flags = {}) {
  const page = await browser.newPage();
  t.after(() => page.close());
  await page.setContent('<div id="root"></div>');
  await page.evaluate(flags => Object.assign(window, flags), flags);
  await page.addScriptTag({ path: bundle });
  await page.waitForSelector('[aria-label="View club details for Source club"]');
  await page.click('[aria-label="View club details for Source club"]');
  await page.waitForSelector('dialog.fo-ledger-drawer[open]');
  return page;
}
async function click(page, label, scope = 'body') {
  await page.waitForFunction((label, scope) => [...document.querySelectorAll(scope + ' button')].some(node => !node.disabled && node.textContent.trim() === label), {}, label, scope);
  await page.evaluate((label, scope) => [...document.querySelectorAll(scope + ' button')].find(node => !node.disabled && node.textContent.trim() === label).click(), label, scope);
}
const review = 'dialog.ap-payment-dialog[open]';
const actionList = page => page.evaluate(() => window.clubCalls.map(call => call.p_action));

test('club directory requires a typed confirmation and refreshes after an exact merge', async t => {
  const page = await open(t, {clubHasPlayers:true});
  await click(page, 'Merge duplicate club');
  await page.waitForSelector(review + ' input[type=search]');
  await page.type(review + ' input[type=search]', 'Destination');
  await click(page, 'Destination club · Inland', review);
  await page.waitForSelector(review + ' input[autocomplete=off]');
  assert.deepEqual(await actionList(page), ['review-merge']);
  assert.equal(await page.$eval(review + ' button[type=submit]', node => node.disabled), true);
  await click(page, 'Change destination', review);
  await page.type(review + ' input[type=search]', 'Inland');
  await click(page, 'Destination club · Inland', review);
  await page.waitForSelector(review + ' input[autocomplete=off]');
  await page.type(review + ' input[autocomplete=off]', 'Source club');
  await click(page, 'Confirm club merge', review);
  await page.waitForFunction(() => document.body.textContent.includes('Merged Source club into Destination club.'));
  const call = await page.evaluate(() => window.clubCalls.at(-1));
  assert.equal(call.p_action, 'merge');
  assert.equal(call.p_source, 'source');
  assert.equal(call.p_target, 'target');
  assert.equal(call.p_expected.source.players, 1);
  await click(page, 'Done', review);
  await page.waitForSelector('dialog.fo-ledger-drawer[open]', { hidden:true });
  await page.waitForSelector('[aria-label="View club details for Destination club"]');
  assert.equal(await page.$('[aria-label="View club details for Source club"]'), null);
});

test('deletion shows dependencies, cancels without a write and denies a revoked operator', async t => {
  const page = await open(t);
  await click(page, 'Delete club');
  await page.waitForSelector(review + ' input[autocomplete=off]');
  await click(page, 'Cancel', review);
  assert.deepEqual(await actionList(page), ['review-delete']);
  await click(page, 'Delete club');
  await page.type(review + ' input[autocomplete=off]', 'Source club');
  await page.evaluate(() => { window.clubRevoked = true; });
  await click(page, 'Confirm club deletion', review);
  await page.waitForSelector(review + ' [role=alert]');
  assert.match(await page.$eval(review + ' [role=alert]', node => node.textContent), /verified super-admin/);
  assert.deepEqual(await actionList(page), ['review-delete','review-delete']);
});

test('a changed club review keeps the record visible and calls for a fresh review', async t => {
  const page = await open(t, { clubStale: true });
  await click(page, 'Delete club');
  await page.waitForSelector(review + ' input[autocomplete=off]');
  await page.type(review + ' input[autocomplete=off]', 'Source club');
  await click(page, 'Confirm club deletion', review);
  await page.waitForSelector(review + ' [role=alert]');
  assert.match(await page.$eval(review + ' [role=alert]', node => node.textContent), /linked records changed/);
  assert.deepEqual(await actionList(page), ['review-delete','delete']);
  assert.equal(await page.$eval(review + ' button[type=submit]', node => node.disabled), true);
});

test('confirmed deletion refreshes the directory while a scoped owner sees only their own club', async t => {
  const tenant = await open(t, {clubTenant:true});
  await tenant.waitForFunction(() => document.body.textContent.includes('About the club'));
  assert.equal(await tenant.$('[aria-label="View club details for Destination club"]'), null);
  assert.equal(await tenant.evaluate(() => [...document.querySelectorAll('button')].some(node => /^(Delete club|Merge duplicate club)$/.test(node.textContent.trim()))), false);
  assert.deepEqual(await actionList(tenant), []);

  const platform = await open(t);
  await click(platform, 'Delete club');
  await platform.type(review + ' input[autocomplete=off]', 'Source club');
  await click(platform, 'Confirm club deletion', review);
  await platform.waitForFunction(() => document.body.textContent.includes('Deleted Source club.'));
  assert.deepEqual(await actionList(platform), ['review-delete','delete']);
  await click(platform, 'Done', review);
  await platform.waitForSelector('[aria-label="View club details for Destination club"]');
  assert.equal(await platform.$('[aria-label="View club details for Source club"]'), null);
});

test('a club owner can review and save their own profile and media with platform settings hidden', async t => {
  const page = await open(t, {clubTenant:true});
  const editor = 'dialog.clubs-full-dialog[open]';
  await page.setRequestInterception(true);
  page.on('request', request => request.abort());
  await click(page, 'Edit club details');
  await page.waitForSelector(editor + ' input[name=city]');
  assert.equal(await page.$(editor + ' input[name=slug]'), null);
  assert.equal(await page.$$eval(editor + ' summary', rows => rows.some(row => row.textContent === 'Federation')), false);
  await page.type(editor + ' input[name=city]', ' City');
  const upload = await page.$(editor + ' input[aria-label="Upload Club logo"]');
  await upload.uploadFile(photo);
  await page.waitForSelector(editor + ' img[src^=blob]');
  await click(page, 'Review changes', editor);
  assert.deepEqual(await page.evaluate(() => [window.clubWrites, window.clubUploads]), [[], []]);
  await click(page, 'Confirm club changes', editor);
  await page.waitForSelector(editor, { hidden:true });
  const [writes, uploads] = await page.evaluate(() => [window.clubWrites, window.clubUploads]);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].id, 'source');
  assert.equal(writes[0].city, 'Coast City');
  assert.match(uploads[0], /^clubs\/logo\/source_/);
  assert.deepEqual(Object.keys(writes[0]).sort(), ['city','id','logo_url','updated_at']);
});
