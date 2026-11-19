import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';

const root = process.cwd();
const directory = await mkdtemp(path.join(tmpdir(), '4m-design-shell-'));
const script = path.join(directory, 'review.js');
let browser;

const mock = `
const email = 'operator@example.invalid';
const user = { id: 'operator-fixture', email };
const listeners = new Set();
const result = data => ({ data, error: null });
const calls = () => window.fixtureCalls;
const tenant = () => window.fixtureAccount === 'tenant';
const north = { id: 'north-fixture', name: 'North organisation', status: 'approved' };
const south = { id: 'south-fixture', name: 'South organisation', status: 'approved' };
let signedIn = true;
const session = () => signedIn ? { user, access_token: 'synthetic-token' } : null;
const ticket = {
  id: '11111111-1111-4111-8111-000000000010', reference: '4M-FIXTURE-10', status: 'open', eventId: '101', eventName: 'North venue question',
  canManage: true, team: 'organiser', requester: { email: 'player@example.invalid', name: 'Fixture player' },
};
const event = {
  id: 101, event_name: 'North open', title: 'North open', start_date: '2035-01-21',
  end_date: '2035-01-21', created_at: '2025-01-01T09:00:00Z', organisation_id: north.id,
  is_manual: true, is_visible: true, sapa_status: 'Silver',
};
function query(table) {
  let rows = table === 'organisation_members' ? [
    { role: 'admin', user_email: email, organisations: north },
    { role: 'owner', user_email: 'other@example.invalid', organisations: south },
  ] : table === 'calendar' || table === 'events' ? [event] : [];
  if (table === 'admin_sidebar_permissions' && !tenant()) rows = [{ email, role: 'super_admin' }];
  let fields = '';
  let single = false;
  const builder = {
    select(value) { fields = value; return builder; },
    eq(key, value) { rows = rows.filter(row => row[key] === value); return builder; },
    in(key, values) { rows = rows.filter(row => values.map(String).includes(String(row[key]))); return builder; },
    order() { return builder; },
    range(start, end) { rows = rows.slice(start, end + 1); return builder; },
    limit(size) { rows = rows.slice(0, size); return builder; },
    abortSignal() { return builder; },
    ilike() { return builder; },
    is() { return builder; },
    or() { return builder; },
    not() { return builder; },
    gte() { return builder; },
    lte() { return builder; },
    neq() { return builder; },
    maybeSingle() { single = true; return builder; },
    single() { return builder.maybeSingle(); },
    then(resolve, reject) { calls().push(['read', table, fields]); return Promise.resolve(result(single ? rows[0] || null : rows)).then(resolve, reject); },
  };
  return builder;
}
export const supabase = {
  auth: {
    onAuthStateChange(listener) {
      listeners.add(listener);
      queueMicrotask(() => listener('INITIAL_SESSION', session()));
      return { data: { subscription: { unsubscribe() { listeners.delete(listener); } } } };
    },
    getSession: async () => result({ session: session() }),
    getUser: async () => result({ user: signedIn ? user : null }),
    signOut: async options => {
      calls().push(['sign-out', options]);
      signedIn = false;
      for (const listener of listeners) listener('SIGNED_OUT', null);
      return result(null);
    },
    mfa: {
      getAuthenticatorAssuranceLevel: async () => result({ currentLevel: 'aal2' }),
      listFactors: async () => result({ totp: [], all: [] }),
    },
  },
  from: query,
  async rpc(name, args = {}) {
    calls().push(['rpc', name, args]);
    const action = args.p_action;
    if (name === 'account_is_active') return result(window.fixtureAccount !== 'inactive');
    if (name === 'is_super_admin') return result(window.fixtureAccount === 'platform');
    if (name === 'help_api') {
      if (action === 'read') return result({ request: ticket, messages: [], next: null });
      if (action === 'list') return result({ rows: [ticket], next: null });
      return result({ unread: 0, topics: [] });
    }
    if (name === 'messaging_api') {
      if (action === 'status') return result({ enabled: true, rulesAccepted: true, groupsEnabled: true, interactive: true });
      return result({ rows: [], next: null });
    }
    if (name === 'list_push_broadcasts_page') return result({ items: [], total: 0, page: 1 });
    return result([]);
  },
  functions: { invoke: async (name, options) => {
    calls().push(['function', name, options]);
    return { data: null, error: { message: 'Synthetic fixture has no external side effects.' } };
  }},
  realtime: { setAuth() {} },
  channel() { return { on() { return this; }, subscribe(listener) { listener?.('SUBSCRIBED'); return this; } }; },
  removeChannel() {},
  storage: { from() { return { getPublicUrl: () => result({ publicUrl: '' }) }; } },
};
export const isSupabaseConfigured = () => true;
`;

before(async () => {
  await build({
    stdin: {
      contents: `
        import { useEffect } from 'react';
        import { createRoot } from 'react-dom/client';
        import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
        import HostedAdminReview from './src/HostedAdminReview.jsx';
        function RouteFixture() {
          const location = useLocation(), navigate = useNavigate();
          useEffect(() => { window.fixtureNavigate = navigate; }, [navigate]);
          return <output hidden data-fixture-route>{location.pathname + location.search + location.hash}</output>;
        }
        window.fixtureStart = initial => createRoot(document.getElementById('fixture')).render(
          <MemoryRouter initialEntries={[initial]}><HostedAdminReview /><RouteFixture /></MemoryRouter>);
      `,
      resolveDir: root, loader: 'jsx',
    },
    bundle: true, jsx: 'automatic', platform: 'browser', format: 'iife', outfile: script,
    define: { 'import.meta.env': '{}' },
    loader: { '.svg': 'dataurl', '.png': 'dataurl', '.jpg': 'dataurl', '.woff2': 'dataurl' },
    plugins: [{ name: 'synthetic-data-only', setup(build) {
      build.onResolve({ filter: /\/supabaseClient(?:\.js)?$/ }, () => ({ path: 'supabase', namespace: 'fixture' }));
      build.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: mock }));
    } }],
  });
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'], protocolTimeout: 20000 });
});

after(async () => {
  await browser?.close();
  await rm(directory, { recursive: true, force: true });
});

async function open(t, initial = '/admin-preview/home', account = 'platform', mobile = false) {
  const page = await browser.newPage();
  t.after(() => page.close());
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  t.after(() => assert.deepEqual(errors, []));
  page.setDefaultTimeout(8000);
  await page.setViewport(mobile ? { width: 390, height: 800 } : { width: 1440, height: 1000 });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.setRequestInterception(true);
  page.on('request', request => request.url() === 'http://fixture.invalid/'
    ? request.respond({ contentType: 'text/html', body: '<!doctype html><meta name="viewport" content="width=device-width"><div id="fixture"></div>' })
    : request.abort());
  await page.goto('http://fixture.invalid/');
  await page.addStyleTag({ path: script.replace(/\.js$/, '.css') });
  await page.addStyleTag({ content: 'body { margin: 0; }' });
  await page.addScriptTag({ path: script });
  await page.evaluate((initial, account) => {
    window.fixtureCalls = [];
    window.fixtureAccount = account;
    window.fixtureStart(initial);
  }, initial, account);
  return page;
}

async function heading(page, title) {
  await page.waitForFunction(title => Array.from(document.querySelectorAll('h1')).some(node => node.textContent.trim() === title), {}, title);
}

async function route(page, expected) {
  await page.waitForFunction(expected => document.querySelector('[data-fixture-route]')?.textContent === expected, {}, expected);
}

async function clickText(page, selector, label, exact = true) {
  await page.waitForFunction((selector, label, exact) => Array.from(document.querySelectorAll(selector)).some(node => node.getClientRects().length
    && (exact ? node.textContent.trim() === label : node.textContent.includes(label))), {}, selector, label, exact);
  const node = await page.evaluateHandle((selector, label, exact) => Array.from(document.querySelectorAll(selector)).find(node => node.getClientRects().length
    && (exact ? node.textContent.trim() === label : node.textContent.includes(label))), selector, label, exact);
  await node.asElement().click();
  await node.dispose();
}

const destination = (page, label) => clickText(page, '.ap-nav-destination', label);

test('the published review shell preserves the original five-workspace desktop dashboard layout', async t => {
  const page = await open(t);
  await heading(page, 'Good morning, Operator.');
  const layout = await page.evaluate(() => {
    const color = selector => getComputedStyle(document.querySelector(selector)).backgroundColor;
    const rect = selector => document.querySelector(selector).getBoundingClientRect();
    return {
      workspaces: Array.from(document.querySelectorAll('.ap-workspace-heading b'), node => node.textContent),
      rail: color('.ap-sidebar'), canvas: color('.ap-root'), width: rect('.ap-sidebar').width,
      accent: getComputedStyle(document.querySelector('.ap-brand strong')).color,
      dashboard: document.querySelectorAll('.ap-metric-rail > div').length,
      attention: rect('.ap-attention').left < rect('.ap-today').left,
      headingFont: getComputedStyle(document.querySelector('h1')).fontFamily,
      topbar: Array.from(document.querySelectorAll('.ap-topbar button')).filter(node => node.offsetWidth).length,
    };
  });
  assert.deepEqual(layout.workspaces, ['Operate', 'Network', 'Money', 'Publish', 'System']);
  assert.equal(layout.rail, 'rgb(23, 27, 24)');
  assert.equal(layout.canvas, 'rgb(244, 245, 242)');
  assert.equal(layout.accent, 'rgb(185, 228, 59)');
  assert.equal(layout.width, 258);
  assert.equal(layout.dashboard, 4);
  assert.equal(layout.attention, true);
  assert.match(layout.headingFont, /^ui-sans-serif/);
  assert.equal(layout.topbar, 5);
  if (process.env.FOURM_SHELL_SCREENSHOT) await page.screenshot({ path: process.env.FOURM_SHELL_SCREENSHOT });
});

const sections = [
  ['Messaging', 'messaging', 'Messaging'],
  ['Help requests', 'help', 'Help requests'],
  ['Account security', 'security', 'Security'],
  ['Coaches', 'coaches', 'Coaches'],
  ['Gallery', 'gallery', 'Gallery albums'],
  ['Email broadcast', 'email', 'Email broadcast'],
  ['Push broadcasts', 'push', 'Push broadcasts'],
  ['Blog', 'blog', 'Blog'],
  ['Settings', 'settings', 'Settings'],
  ['Integrations', 'integrations', 'Integrations'],
  ['Audit log', 'audit-log', 'Audit log'],
];
for (const [label, target, title] of sections) {
  test(`sidebar opens ${label} in the same New Admin layout`, async t => {
    const page = await open(t);
    await heading(page, 'Good morning, Operator.');
    await destination(page, label);
    await route(page, '/admin-preview/' + target);
    await heading(page, title);
    const active = await page.$eval('.ap-nav-destination[aria-current="page"]', node => node.textContent.trim());
    assert.equal(active, label);
    assert.equal(await page.$$eval('.ap-main .ap-root, .ap-main aside.ap-sidebar, .ap-main iframe', nodes => nodes.length), 0);
    assert.equal(await page.$eval('.ap-root', node => getComputedStyle(node).backgroundColor), 'rgb(244, 245, 242)');
  });
}

test('search opens a filtered workspace via keyboard and closes via Escape', async t => {
  const page = await open(t);
  await heading(page, 'Good morning, Operator.');
  await page.click('.ap-search-button');
  await page.waitForSelector('#admin-command-search', { visible: true });
  await page.focus('#admin-command-search');
  await page.keyboard.type('Push broadcasts');
  await page.keyboard.press('Enter');
  await route(page, '/admin-preview/push');
  await heading(page, 'Push broadcasts');
  await page.waitForSelector('.ap-command', { hidden: true });
  await page.keyboard.down('Control');
  await page.keyboard.press('KeyK');
  await page.keyboard.up('Control');
  await page.waitForSelector('.ap-command', { visible: true });
  await page.keyboard.press('Escape');
  await page.waitForSelector('.ap-command', { hidden: true });
});

test('platform scope selection is reflected and reload rechecks the signed-in account', async t => {
  const page = await open(t, '/admin-preview/events');
  await page.waitForSelector('.ap-scope-trigger', { visible: true });
  await page.click('.ap-scope-trigger');
  await clickText(page, '.ap-scope-menu [role="option"] b', 'North organisation');
  assert.match(await page.$eval('.ap-scope-trigger', node => node.textContent), /North organisation/);
  assert.equal(await page.$$eval('.ap-scope-menu [role="option"] b', nodes => nodes.some(node => node.textContent === 'South organisation')), false);
  const reads = () => page.evaluate(() => window.fixtureCalls.filter(call => call[0] === 'rpc' && call[1] === 'account_is_active').length);
  const before = await reads();
  await page.click('[aria-label="Reload live data"]');
  await page.waitForFunction(previous => window.fixtureCalls.filter(call => call[0] === 'rpc' && call[1] === 'account_is_active').length > previous, {}, before);
});

test('a tenant sees only its authorised scopes and cannot open platform tools from direct links', async t => {
  const page = await open(t, '/admin-preview/events', 'tenant');
  await page.waitForSelector('.ap-scope-trigger', { visible: true });
  await page.click('.ap-scope-trigger');
  await page.waitForSelector('.ap-scope-menu [role="option"]', { visible: true });
  assert.deepEqual(await page.$$eval('.ap-scope-menu [role="option"] b', nodes => nodes.map(node => node.textContent)), ['North organisation']);
  const visible = await page.$$eval('.ap-nav-destination', nodes => nodes.map(node => node.textContent.trim()));
  assert.ok(visible.includes('Messaging'));
  assert.ok(visible.includes('Help requests'));
  for (const blocked of ['Payments', 'Email broadcast', 'Gallery', 'Settings', 'Access & permissions']) assert.equal(visible.includes(blocked), false);
  assert.equal(await page.$('.ap-create'), null);
  await page.evaluate(() => window.fixtureNavigate('/admin-preview/email'));
  await heading(page, 'Workspace unavailable');
  await clickText(page, '.ap-main button', 'Open my workspace');
  await route(page, '/admin-preview/events');
  await page.click('[aria-label="Open notifications"]');
  await route(page, '/admin-preview/help');
  await heading(page, 'Help requests');
});

test('platform notifications open a live native destination', async t => {
  const page = await open(t);
  await heading(page, 'Good morning, Operator.');
  await page.click('[aria-label="Open notifications"]');
  await page.waitForSelector('dialog[open][aria-label="Notifications"]');
  await clickText(page, 'dialog[open] button', 'Open calendar');
  await route(page, '/admin-preview/calendar');
  await page.waitForSelector('dialog[aria-label="Notifications"]', { hidden: true });
});

for (const [label, kind] of [['Full event', 'full'], ['Quick event', 'quick']]) {
  test(`shell Create opens the light ${kind} event editor`, async t => {
    const page = await open(t);
    await heading(page, 'Good morning, Operator.');
    await page.click('.ap-create');
    await page.waitForSelector('dialog[open][aria-label="Create an event"]');
    await clickText(page, 'dialog[open] button', label, false);
    await page.waitForFunction(() => Boolean(document.querySelector('[role="dialog"].ap-live-event-editor')));
    await route(page, '/admin-preview/calendar');
    assert.equal(await page.$eval('.ap-live-event-editor > div:first-child', node => getComputedStyle(node).backgroundColor), 'rgb(250, 251, 248)');
  });
}

test('a Help deep link opens the ticket and leaving does not persist it into later sidebar navigation', async t => {
  const page = await open(t, '/admin-preview/help?ticket=11111111-1111-4111-8111-000000000010');
  await heading(page, 'Help requests');
  await page.waitForFunction(() => window.fixtureCalls.some(call => call[0] === 'rpc' && call[1] === 'help_api' && call[2].p_action === 'read'));
  await page.waitForSelector('[aria-label="Help conversation"]', { visible: true });
  await destination(page, 'Messaging');
  await route(page, '/admin-preview/messaging');
  await heading(page, 'Messaging');
  await destination(page, 'Help requests');
  await route(page, '/admin-preview/help');
  await heading(page, 'Help requests');
  const reads = await page.evaluate(() => window.fixtureCalls.filter(call => call[0] === 'rpc' && call[1] === 'help_api' && call[2].p_action === 'read').length);
  assert.equal(reads, 1);
});

test('mobile navigation opens, closes on selection and logs out the local session', async t => {
  const page = await open(t, '/admin-preview/home', 'platform', true);
  await heading(page, 'Good morning, Operator.');
  const menu = '[aria-label="Open navigation"]';
  await page.waitForSelector(menu, { visible: true });
  await page.click(menu);
  await page.waitForFunction(() => document.querySelector('.ap-sidebar.is-open')?.getBoundingClientRect().left >= 0);
  await destination(page, 'Settings');
  await route(page, '/admin-preview/settings');
  await heading(page, 'Settings');
  await page.waitForSelector('.ap-sidebar-scrim', { hidden: true });
  assert.equal(await page.$('.ap-sidebar.is-open'), null);
  await page.click(menu);
  await page.waitForFunction(() => document.querySelector('.ap-sidebar.is-open')?.getBoundingClientRect().left >= 0);
  await page.click('[aria-label="Log out"]');
  await page.waitForSelector('.ap-root', { hidden: true });
  assert.deepEqual(await page.evaluate(() => window.fixtureCalls.find(call => call[0] === 'sign-out')), ['sign-out', { scope: 'local' }]);
});

test('an inactive signed-in account never mounts the Admin shell', async t => {
  const page = await open(t, '/admin-preview/help', 'inactive');
  await heading(page, 'Review access is required');
  assert.equal(await page.$('.ap-root'), null);
  assert.doesNotMatch(await page.$eval('body', node => node.textContent), /North venue question/);
});

test('the old Player URL opens the original Players workspace and preserves the selected view', async t => {
  const page = await open(t, '/admin-preview/player?view=directory');
  await route(page, '/admin-preview/players?view=directory');
  await heading(page, 'Players');
});
