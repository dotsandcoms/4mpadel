import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';

let browser, directory, bundle;
const marker = '2026-11-01T15:00:00.000Z';
const fixture = `
  import { createRoot } from 'react-dom/client';
  import ClubsWorkspace from './src/pages/admin-preview/ClubsWorkspace.jsx';

  const { mode, marker } = window.flags;
  const session = { user: { id: 'fixture-operator', email: 'operator@example.test' } };
  const rows = [
    { id: 'north', name: 'North Courts', city: 'Cape Town', status: 'published',
      updated_at: marker, group_id: 'fixture-group', logo_url: '/old-logo.png', website_url: 'https://old.example.test' },
    { id: 'south', name: 'South Courts', city: 'George', status: 'published', updated_at: marker },
  ];
  const state = window.state = { rows, reads: [], writes: [], checks: [] };
  const result = data => ({ data, error: null });
  const client = {
    auth: { getUser: async () => result({ user: session.user }) },
    async rpc(name, args) {
      state.checks.push({ name, args });
      if (name === 'account_is_active') return result(!state.inactive);
      if (name === 'is_super_admin') return result(mode === 'platform' && !state.revoked);
      if (name === 'can_manage_club') return result(mode === 'owner' && args.p_club_id === 'north' && !state.revoked);
      return result(null);
    },
    from(table) {
      const filters = {};
      let start = 0, end, fields, write;
      const select = () => table === 'clubs'
        ? rows.filter(row => Object.entries(filters).every(([field, value]) => (row[field] ?? null) === value)).slice(start, end)
        : [];
      const project = row => fields === '*' ? { ...row } : Object.fromEntries(fields.split(',').map(key => [key, row[key]]));
      const query = {
        select(value) { fields = value; return query; },
        eq(key, value) { filters[key] = value; return query; },
        is(key, value) { filters[key] = value; return query; },
        in() { return query; },
        order() { return query; },
        range(first, last) { start = first; end = last + 1; return query; },
        abortSignal() { return query; },
        update(value) { write = value; return query; },
        async single() {
          if (write && state.race) {
            rows[0].city = 'Simons Town';
            rows[0].updated_at = '2026-11-02T15:00:00.000Z';
          }
          const [row] = select();
          if (write) {
            state.writes.push({ table, filters, write, found: Boolean(row) });
            if (row) Object.assign(row, write);
          } else {
            state.reads.push({ table, fields, filters });
          }
          return row ? result(project(row)) : { data: null, error: { message: 'No row matched.' } };
        },
        then(accept, reject) {
          state.reads.push({ table, fields, filters });
          return Promise.resolve(result(select().map(project))).then(accept, reject);
        },
      };
      return query;
    },
  };
  const permissions = mode === 'platform' ? { role: 'super_admin' } : mode === 'owner'
    ? { role: 'club_admin', clubs: [{ id: 'north', member_role: 'owner' }] }
    : mode === 'unrelated'
      ? { role: 'org_admin', allowed_tabs: ['clubs'], orgs: [{ id: 'elsewhere', member_role: 'owner' }] }
      : { role: 'admin', allowed_tabs: ['clubs'] };
  const scopeId = mode === 'owner' || mode === 'unrelated' ? 'club:north' : 'all';
  createRoot(document.getElementById('root')).render(<ClubsWorkspace client={client} session={session}
    scopeId={scopeId} permissions={permissions}/>);
`;

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'fourm-club-city-ui-'));
  bundle = join(directory, 'fixture.js');
  await build({
    stdin: { contents: fixture, resolveDir: process.cwd(), loader: 'jsx' },
    bundle: true, outfile: bundle, format: 'iife', jsx: 'automatic', platform: 'browser',
    define: { 'import.meta.env': '{}' },
    plugins: [{ name: 'offline-client', setup(builder) {
      builder.onResolve({ filter: /\/(supabaseClient|googleMaps)(?:\.js)?$/ }, args => ({
        path: args.path.includes('googleMaps') ? 'maps' : 'client', namespace: 'fixture',
      }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({
        contents: args.path === 'maps'
          ? 'export const attachPlacesAutocomplete = async () => ({ destroy() {} }); export const loadGoogleMaps = async () => null;'
          : 'export const supabase = null; export const isSupabaseConfigured = () => false;',
      }));
    } }],
  });
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
});

after(async () => {
  await browser?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

const action = '[aria-label="Edit city for North Courts"]';
const dialog = 'dialog.clubs-city-dialog[open]';
async function open(t, mode) {
  const page = await browser.newPage();
  t.after(() => page.close());
  await page.setOfflineMode(true);
  await page.setContent('<div id="root"></div>');
  await page.evaluate(flags => { window.flags = flags; }, { mode, marker });
  await page.addScriptTag({ path: bundle });
  await page.waitForSelector(mode === 'unrelated' ? '.clubs-notice' : '[aria-label="View club details for North Courts"]');
  return page;
}

async function click(page, label) {
  const buttons = await page.$$(dialog + ' button');
  for (const button of buttons) {
    if (!await button.evaluate((node, label) => !node.disabled && node.textContent.trim() === label, label)) continue;
    await button.click();
    return;
  }
  assert.fail('No enabled button labelled ' + label);
}

async function reviewCity(page, updated) {
  await page.click(action);
  const selector = dialog + ' input[name="city"]';
  await page.waitForSelector(selector);
  assert.equal(await page.$eval(selector, input => input.value), 'Cape Town');
  await page.$eval(selector, (input, updated) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, updated);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, updated);
  await click(page, 'Review city change');
  await page.waitForFunction(dialog => document.querySelector(dialog)?.innerText.includes('Current city'), {}, dialog);
  assert.deepEqual(await page.evaluate(() => window.state.writes), []);
  return await page.$$eval(dialog + ' dd', nodes => nodes.map(node => node.innerText));
}

test('platform city review updates only the approved city of the exact directory club', async t => {
  const page = await open(t, 'platform');
  assert.deepEqual(await reviewCity(page, '  Stellenbosch  '), ['Cape Town', 'Stellenbosch']);
  await click(page, 'Confirm city change');
  await page.waitForSelector(dialog, { hidden: true });
  assert.match(await page.$eval(action, button => button.closest('td').innerText), /Stellenbosch/);
  const state = await page.evaluate(() => window.state);
  assert.equal(state.writes.length, 1);
  assert.deepEqual(state.writes[0].filters, { id: 'north', updated_at: marker, city: 'Cape Town' });
  assert.equal(state.writes[0].found, true);
  assert.deepEqual(Object.keys(state.writes[0].write).sort(), ['city', 'updated_at']);
  assert.equal(state.writes[0].write.city, 'Stellenbosch');
  assert.equal(state.rows[0].website_url, 'https://old.example.test');
  assert.equal(state.rows[0].logo_url, '/old-logo.png');
  assert.equal(state.rows[1].city, 'George');
  const exact = state.reads.filter(read => read.table === 'clubs' && read.fields === 'id,name,city,updated_at');
  assert.equal(exact.length, 2);
  assert.ok(exact.every(read => read.filters.id === 'north'));
  assert.ok(state.checks.filter(check => check.name === 'is_super_admin').length >= 3);
});

test('an exact club owner can review and clear the city', async t => {
  const page = await open(t, 'owner');
  assert.equal(await page.$('[aria-label="Edit city for South Courts"]'), null);
  assert.deepEqual(await reviewCity(page, ''), ['Cape Town', 'Not recorded']);
  await click(page, 'Confirm city change');
  await page.waitForSelector(dialog, { hidden: true });
  const state = await page.evaluate(() => window.state);
  assert.equal(state.rows[0].city, null);
  assert.equal(state.rows[1].city, 'George');
  const exactChecks = state.checks.filter(check => check.name === 'can_manage_club');
  assert.equal(exactChecks.length, 3);
  assert.ok(exactChecks.every(check => check.args.p_club_id === 'north'));
  assert.ok(state.reads.every(read => read.table === 'clubs' && read.filters.id === 'north'));
});

test('closing the reviewed city action does not write', async t => {
  const page = await open(t, 'owner');
  await reviewCity(page, 'Paarl');
  await click(page, 'Cancel');
  await page.waitForSelector(dialog, { hidden: true });
  assert.deepEqual(await page.evaluate(() => window.state.writes), []);
});

test('the city review requires fresh club authority and an unchanged snapshot', async t => {
  const revoked = await open(t, 'owner');
  await reviewCity(revoked, 'Paarl');
  await revoked.evaluate(() => { window.state.revoked = true; });
  await click(revoked, 'Confirm city change');
  await revoked.waitForSelector(dialog + ' [role="alert"]');
  assert.match(await revoked.$eval(dialog + ' [role="alert"]', node => node.innerText), /Current permission to manage this club is required/);
  assert.deepEqual(await revoked.evaluate(() => window.state.writes), []);

  const changed = await open(t, 'owner');
  await reviewCity(changed, 'Paarl');
  await changed.evaluate(() => Object.assign(window.state.rows[0], { city: 'George', updated_at: '2026-11-02T15:00:00.000Z' }));
  await click(changed, 'Confirm city change');
  await changed.waitForSelector(dialog + ' [role="alert"]');
  assert.match(await changed.$eval(dialog + ' [role="alert"]', node => node.innerText), /changed since opening/);
  assert.deepEqual(await changed.evaluate(() => window.state.writes), []);
});

test('a change arriving between the fresh read and write fails the exact compare-and-set', async t => {
  const page = await open(t, 'owner');
  await reviewCity(page, 'Paarl');
  await page.evaluate(() => { window.state.race = true; });
  await click(page, 'Confirm city change');
  await page.waitForSelector(dialog + ' [role="alert"]');
  assert.match(await page.$eval(dialog + ' [role="alert"]', node => node.innerText), /Club save could not be confirmed/);
  const state = await page.evaluate(() => window.state);
  assert.equal(state.rows[0].city, 'Simons Town');
  assert.equal(state.writes.length, 1);
  assert.equal(state.writes[0].found, false);
});

test('directory-only and unrelated accounts cannot open a city editor', async t => {
  const viewer = await open(t, 'viewer');
  assert.equal(await viewer.$(action), null);
  assert.deepEqual(await viewer.evaluate(() => window.state.checks), []);
  const unrelated = await open(t, 'unrelated');
  assert.equal(await unrelated.$(action), null);
  assert.deepEqual(await unrelated.evaluate(() => window.state.reads), []);
});
