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
const paymentFixture = () => window.fixtureAccount === 'platform-payment';
const platform = () => window.fixtureAccount === 'platform' || paymentFixture();
const dashboardOnly = () => window.fixtureAccount === 'dashboard-only';
const eventCoAdmin = () => window.fixtureAccount === 'event-co-admin';
const clubAssignee = () => window.fixtureAccount === 'club-event-assignee';
const clubFixture = () => clubAssignee() || window.fixtureAccount === 'club-no-assignment';
const communicationsFixture = () => eventCoAdmin() || clubFixture();
const canManageCommunications = () => eventCoAdmin() || clubAssignee();
const playerFixture = () => window.fixturePlayersRoute === true;
const player = { id: 12, name: 'Fixture Player', email: 'player@example.invalid', home_club: 'Fixture Club', approved: true };
const north = { id: 'north-fixture', name: 'North organisation', status: 'approved' };
const south = { id: 'south-fixture', name: 'South organisation', status: 'approved' };
const club = { id: 'own-club', name: 'Own club', status: 'published' };
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
const drawDivision = { id: 'north-open-division', event_id: event.id, name: 'Open division', format: 'knockout', is_active: true };
const paymentEvent = { ...event, id:202, event_name:'Other fixture event', slug:'other-fixture-event' };
const failedEntry = { id:50, event_id:202, email:'entrant@example.invalid', full_name:'Failed payment player', status:'registered',
  payment_status:'failed', division:'Open', payment_reference:'EVREG-FIXTURE-202' };
function query(table) {
  let rows = table === 'organisation_members' ? [
    { role: 'admin', user_email: email, organisation_id: north.id, organisations: north },
    { role: 'owner', user_email: 'other@example.invalid', organisation_id: south.id, organisations: south },
  ].filter(row => (window.fixtureAccount !== 'players-only' && !dashboardOnly() && !communicationsFixture()) || row.user_email !== email)
   : table === 'club_members' && clubFixture() ? [{ role: 'admin', user_email: email, clubs: club }]
   : table === 'calendar' || table === 'events' ? (paymentFixture() ? [event,paymentEvent] : [event])
   : table === 'organisations' ? [north, south]
   : table === 'tournament_divisions' && window.fixtureEventDraw ? [drawDivision]
   : table === 'players' && playerFixture() ? [player]
   : table === 'event_registrations' && playerFixture() ? [{ id: 3, event_id: event.id, email: player.email, status: 'registered', payment_status: 'pending', division: 'Open', calendar: event }]
   : table === 'event_registrations' && paymentFixture() ? [failedEntry]
   : [];
  if (table === 'admin_sidebar_permissions') {
    if (platform()) rows = [{ email, role: 'super_admin' }];
    else if (dashboardOnly()) rows = [{ email, role: 'custom', allowed_tabs: ['dashboard'] }];
    else if (playerFixture()) rows = [{ email, role: 'custom', allowed_tabs: ['players'] }];
    else if (eventCoAdmin()) rows = [{ email, role: 'custom', allowed_tabs: ['event-mgmt'] }];
    else if (clubAssignee()) rows = [{ email, role: 'custom', allowed_tabs: [], module_permissions: { 'event-mgmt': { allowedEvents: [event.id] } } }];
  }
  let fields = '';
  let single = false;
  const builder = {
    select(value) { fields = value; return builder; },
    eq(key, value) { rows = rows.filter(row => row[key] === value || (['id', 'event_id'].includes(key) && String(row[key]) === String(value))); return builder; },
    in(key, values) { rows = rows.filter(row => values.map(String).includes(String(row[key]))); return builder; },
    order() { return builder; },
    range(start, end) { rows = rows.slice(start, end + 1); return builder; },
    limit(size) { rows = rows.slice(0, size); return builder; },
    abortSignal() { return builder; },
    ilike(key, value) {
      if (playerFixture()) rows = rows.filter(row => String(row[key] || '').toLowerCase() === String(value).toLowerCase());
      return builder;
    },
    is() { return builder; },
    or() { return builder; },
    not() { return builder; },
    gte() { return builder; },
    lte() { return builder; },
    neq(key, value) { if (playerFixture()) rows = rows.filter(row => row[key] !== value); return builder; },
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
    signInWithOtp: async options => { calls().push(['invite', options]); return result(null); },
    resetPasswordForEmail: async (email, options) => { calls().push(['recovery', email, options]); return result(null); },
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
    if (name === 'is_super_admin') return result(platform());
    if (name === 'help_api') {
      if (communicationsFixture() && action === 'read' && (!canManageCommunications() || args.p_data.id !== ticket.id)) {
        return { error: { code: '42501', message: 'This help request is unavailable.' } };
      }
      if (action === 'read') return result({ request: ticket, messages: [], next: null });
      if (action === 'list') {
        const permitted = !communicationsFixture() || (canManageCommunications() && (!args.p_data.eventId || String(args.p_data.eventId) === String(event.id)));
        return result({ rows: permitted ? [ticket] : [], next: null });
      }
      return result({ unread: 0, topics: [] });
    }
    if (communicationsFixture() && name === 'messaging_event_directory') return result(canManageCommunications() ? [event] : []);
    if (communicationsFixture() && name === 'messaging_event_analytics') {
      return canManageCommunications() && Number(args.p_event) === event.id
        ? result({ event, announcements: [] })
        : { error: { code: '42501', message: 'Event messaging access denied.' } };
    }
    if (name === 'messaging_api') {
      if (action === 'status') return result({ enabled: true, rulesAccepted: true, groupsEnabled: true, interactive: true });
      if (communicationsFixture() && action === 'open_event' && canManageCommunications() && Number(args.p_data.eventId) === event.id) {
        return result([{ id: 'exact-announcements', kind: 'event_announcements', manager: true }]);
      }
      return result({ rows: [], next: null });
    }
    if (name === 'can_manage_event') return result(Number(args.p_event_id) === event.id);
    if (name === 'is_organisation_admin') return result(args.p_organisation_id === north.id);
    if (name === 'event_finance_overview_source') return result({events:[event],registrations:[],payments:[],divisions:[],refunds:[]});
    if (name === 'organisation_banking') {
      if (action === 'summary') return result({ saved: false });
      if (action === 'list') return result({ requests: [], can_process: !tenant() });
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
    window.fixturePlayersRoute = /^\/admin-preview\/players?(?:\?|$)/.test(initial);
    window.fixtureEventDraw = initial === '/admin-preview/event?event=101&tab=overview';
    window.fixtureStart(initial);
  }, initial, account);
  return page;
}

async function heading(page, title) {
  await page.waitForFunction(title => Array.from(document.querySelectorAll('h1')).some(node => node.textContent.trim() === title), {}, title);
}

async function route(page, expected) {
  await page.waitForFunction(expected => document.querySelector('[data-fixture-route]')?.textContent === expected, { polling: 50 }, expected);
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

test('a failed payment opens its exact event and registration from the dashboard and after a fresh sign-in', async t => {
  const page = await open(t, '/admin-preview/home', 'platform-payment');
  const paymentRoute = '/admin-preview/payment?event=202&registration=50';
  await clickText(page, 'button.ap-attention-row', 'Recover declined payment', false);
  await route(page, paymentRoute);
  await heading(page, 'Registration payment');
  assert.match(await page.$eval('.ap-payment-summary', node => node.innerText), /EVREG-FIXTURE-202/);
  await clickText(page, 'a.ap-primary', 'Manage entry');
  await route(page, '/admin-preview/event?event=202&registration=50');
  await heading(page, 'Other fixture event');
  const direct = await open(t, '/admin-preview/payment?registration=50', 'platform-payment');
  await heading(direct, 'Registration payment');
  await clickText(direct, 'button.ap-secondary', 'View registration');
  await route(direct, '/admin-preview/registrations?event=202&registration=50');
});

test('dashboard-only staff never get event navigation or a misleading empty operations report', async t => {
  const page = await open(t, '/admin-preview/home', 'dashboard-only');
  await heading(page, 'Good morning, Operator.');
  const screen = await page.evaluate(() => ({ labels: [...document.querySelectorAll('button')].map(node => node.textContent.trim()),
    metrics: Boolean(document.querySelector('.ap-metric-rail')), calls: window.fixtureCalls }));
  assert.equal(screen.metrics, false);
  assert.ok(!['All events','Review event readiness','View all','Event Manager'].some(label => screen.labels.includes(label)));
  assert.ok(!screen.calls.some(call => call[0] === 'read' && ['calendar','event_registrations'].includes(call[1])));
  await destination(page, 'Account security');
  await route(page, '/admin-preview/security');
});

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

test('Event Manager co-admins and explicit venue assignees can open their exact Messaging and Help records', async t => {
  for (const account of ['event-co-admin', 'club-event-assignee']) {
    const page = await open(t, '/admin-preview/messaging?event=101', account);
    await heading(page, 'Messaging');
    await page.waitForFunction(() => window.fixtureCalls.some(call => call[1] === 'messaging_api'
      && call[2]?.p_action === 'read' && call[2]?.p_data?.conversationId === 'exact-announcements'));
    await page.evaluate(() => window.fixtureNavigate('/admin-preview/help?event=101&ticket=11111111-1111-4111-8111-000000000010'));
    await heading(page, 'Help requests');
    await page.waitForSelector('#help-reply');
    await page.evaluate(() => window.fixtureNavigate('/admin-preview/help?event=202&ticket=11111111-1111-4111-8111-000000000020'));
    await page.waitForFunction(() => Array.from(document.querySelectorAll('[role="alert"]')).some(alert => alert.textContent === 'This help request is unavailable.'));
    assert.equal(await page.$('#help-reply'), null);
    await page.evaluate(() => window.fixtureNavigate('/admin-preview/messaging?event=202'));
    await page.waitForFunction(() => Array.from(document.querySelectorAll('[role="alert"]')).some(alert => alert.textContent === 'Event messaging access denied.'));
    assert.equal(await page.evaluate(() => window.fixtureCalls.some(call => call[1] === 'messaging_api'
      && call[2]?.p_action === 'open_event' && call[2]?.p_data?.eventId === 202)), false);
    const visible = await page.$$eval('.ap-nav-destination', nodes => nodes.map(node => node.textContent.trim()));
    for (const blocked of ['Payments', 'Players', 'Email broadcast', 'Push broadcasts', 'Payouts', 'Access & permissions']) {
      assert.equal(visible.includes(blocked), false, blocked);
    }
  }
});

test('a club admin with no explicit event grant cannot mount Messaging or Help through direct links', async t => {
  const page = await open(t, '/admin-preview/messaging?event=101', 'club-no-assignment');
  await heading(page, 'Workspace unavailable');
  await page.evaluate(() => window.fixtureNavigate('/admin-preview/help?event=101'));
  await route(page, '/admin-preview/help?event=101');
  await heading(page, 'Workspace unavailable');
  assert.equal(await page.evaluate(() => window.fixtureCalls.some(call => ['help_api', 'messaging_api', 'messaging_event_directory'].includes(call[1]))), false);
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

test('Event Overview opens the exact division draw generator and the canonical public event URL', async t => {
  const page = await open(t, '/admin-preview/event?event=101&tab=overview');
  await heading(page, 'North open');
  await page.$eval('button[aria-label="Event options"]', button => button.click());
  await page.waitForSelector('[role="dialog"] a');
  assert.equal(await page.$eval('[role="dialog"] a', link => link.href), 'https://4mpadel.co.za/calendar/101');
  await page.$eval('[role="dialog"] button[aria-label="Close dialog"]', button => button.click());
  await page.waitForSelector('[role="dialog"]', { hidden: true });
  await page.$eval('button.ap-division-button', button => button.click());
  const generator = '[role="dialog"] button.ap-primary';
  await page.waitForSelector(generator);
  assert.equal(await page.$eval(generator, button => button.textContent.trim()), 'Draw generator');
  await page.$eval(generator, button => button.click());
  await route(page, '/admin-preview/tournaments?event=101&workspace=draws&division=north-open-division');
});

test('an organisation admin can open the draw generator for their organisation event', async t => {
  const page = await open(t, '/admin-preview/event?event=101&tab=overview', 'tenant');
  await page.waitForSelector('button.ap-division-button');
  await page.$eval('button.ap-division-button', button => button.click());
  const generator = '[role="dialog"] button.ap-primary';
  await page.waitForSelector(generator);
  assert.equal(await page.$eval(generator, button => button.textContent.trim()), 'Draw generator');
  await page.$eval(generator, button => button.click());
  await page.waitForFunction(() => {
    const current = document.querySelector('[data-fixture-route]')?.textContent;
    if (!current) return false;
    const { pathname, searchParams } = new URL(current, 'http://fixture.invalid');
    return pathname === '/admin-preview/event' && searchParams.get('event') === '101'
      && searchParams.get('action') === 'host-draw' && searchParams.get('workspace') === 'draws'
      && searchParams.get('division') === 'north-open-division';
  });
});

test('draw details show no write entry point for Event Manager without host or draw authority', async t => {
  const page = await open(t, '/admin-preview/event?event=101&tab=overview', 'event-co-admin');
  await page.waitForSelector('button.ap-division-button');
  await page.$eval('button.ap-division-button', button => button.click());
  await page.waitForSelector('[role="dialog"]');
  assert.match(await page.$eval('[role="dialog"]', dialog => dialog.textContent), /Draw changes require Tournament Manager access/);
  assert.equal(await page.$('[role="dialog"] .ap-primary'), null);
});

test('verified platform permission reaches the Players page and its account controls', async t => {
  const page = await open(t, '/admin-preview/players?player=12');
  await page.waitForSelector('dialog[open][aria-label="Player record"]');
  assert.equal(await page.$eval('.pp-drawer-footer a', node => node.href), 'https://4mpadel.co.za/players?id=12');
  await clickText(page, 'dialog[open] nav button', 'Manage');
  assert.deepEqual(await page.$$eval('.pp-manage-grid button', nodes => nodes.map(node => node.textContent)), [
    'Edit profile', 'Send login invite', 'Reset password', 'Preview player account', 'Delete player',
  ]);
  assert.equal(await page.$eval('dialog[open] .pp-drawer-body a', node => node.pathname + node.search), '/admin-preview/licenses?license_player=12');

  await clickText(page, '.pp-manage-grid button', 'Preview player account');
  const preview = 'dialog[open][aria-label="Preview player account"]';
  await page.waitForFunction(selector => document.querySelector(selector)?.textContent.includes('North open'), {}, preview);
  assert.match(await page.$eval(preview, node => node.textContent), /Fixture Player.*Fixture Club.*North open.*Open.*pending/);
  assert.equal(await page.evaluate(() => sessionStorage.length), 0);
  assert.equal(await page.evaluate(() => window.fixtureCalls.some(([call]) => ['invite', 'recovery', 'sign-out'].includes(call))), false);
  await page.keyboard.press('Escape');
  await page.waitForSelector(preview, { hidden: true });
  assert.equal(await page.evaluate(() => document.activeElement.textContent), 'Preview player account');

  await clickText(page, '.pp-manage-grid button', 'Send login invite');
  const invite = 'dialog[open][aria-label="Send login invite"]';
  await page.waitForSelector(invite);
  assert.equal(await page.$eval(invite + ' .ap-primary', node => node.disabled), true);
  await page.click(invite + ' input[type="checkbox"]');
  await page.click(invite + ' .ap-primary');
  await page.waitForFunction(() => window.fixtureCalls.some(([call]) => call === 'invite'));
  assert.deepEqual(await page.evaluate(() => window.fixtureCalls.find(([call]) => call === 'invite')), ['invite', {
    email: 'player@example.invalid', options: { emailRedirectTo: 'https://4mpadel.co.za/profile?new_invite=true' },
  }]);
  await page.waitForFunction(selector => document.querySelector(selector)?.textContent.includes('Invitation requested'), {}, invite);
  await page.keyboard.press('Escape');
  await clickText(page, '.pp-manage-grid button', 'Reset password');
  const reset = 'dialog[open][aria-label="Reset password"]';
  await page.click(reset + ' input[type="checkbox"]');
  await page.click(reset + ' .ap-primary');
  await page.waitForFunction(() => window.fixtureCalls.some(([call]) => call === 'recovery'));
  assert.deepEqual(await page.evaluate(() => window.fixtureCalls.find(([call]) => call === 'recovery')), [
    'recovery', 'player@example.invalid', { redirectTo: 'https://4mpadel.co.za/reset-password' },
  ]);
  await page.waitForFunction(selector => document.querySelector(selector)?.textContent.includes('Password reset requested'), {}, reset);
  await page.keyboard.press('Escape');
  await clickText(page, '.pp-manage-grid button', 'Delete player');
  const deletion = 'dialog[open][aria-label="Delete player"]';
  await page.waitForSelector(deletion);
  assert.equal(await page.$eval(deletion + ' .ap-danger-button', node => node.disabled), true);
  await page.keyboard.press('Escape');
  await page.waitForSelector(deletion, { hidden: true });
  await page.keyboard.press('Escape');
  await page.waitForSelector('dialog[open][aria-label="Player record"]', { hidden: true });
  await route(page, '/admin-preview/players');
  await clickText(page, '.pp-heading button', 'Add player');
  await page.waitForSelector('dialog[open][aria-label="Add player profile"] input[name="name"]');
});

test('a standalone Players editor sees profile editing only and a tenant grant opens no directory', async t => {
  const staff = await open(t, '/admin-preview/players?player=12', 'players-only');
  await staff.waitForSelector('dialog[open][aria-label="Player record"]');
  await clickText(staff, 'dialog[open] nav button', 'Manage');
  assert.deepEqual(await staff.$$eval('.pp-manage-grid button', nodes => nodes.map(node => node.textContent)), ['Edit profile']);
  assert.equal(await staff.$('dialog[open] a[href*="/licenses"]'), null);
  await clickText(staff, '.pp-manage-grid button', 'Edit profile');
  await staff.waitForSelector('dialog[open][aria-label="Edit Fixture Player profile"]');

  const tenantPage = await open(t, '/admin-preview/players?player=12', 'tenant');
  await heading(tenantPage, 'Workspace unavailable');
  assert.equal(await tenantPage.$('.pp-workspace'), null);
  assert.equal(await tenantPage.evaluate(() => window.fixtureCalls.some(([kind, table, fields]) =>
    kind === 'read' && table === 'players' && fields.includes('contact_number'))), false);
});


test('the Event Manager payout button opens the exact organisation and event for an organisation admin', async t => {
  const page = await open(t, '/admin-preview/event?event=101&tab=statement', 'tenant');
  await heading(page, 'North open');
  await clickText(page, '.ap-main button', 'Open payout requests');
  await route(page, '/admin-preview/payouts?organisation=north-fixture&event=101');
  await heading(page, 'Organiser payouts');
  await page.waitForFunction(() => window.fixtureCalls.some(call => call[0] === 'rpc'
    && call[1] === 'organisation_banking' && call[2].p_org_id === 'north-fixture'));
  assert.equal(await page.evaluate(() => window.fixtureCalls.some(call => call[0] === 'rpc'
    && call[1] === 'organisation_banking' && call[2].p_org_id === 'south-fixture')), false);
});

test('an organisation profile opens its own banking workspace in the request view', async t => {
  const page = await open(t, '/admin-preview/organisations', 'platform');
  await heading(page, 'Organisations');
  await clickText(page, 'tr:first-child button', 'View profile');
  await clickText(page, 'dialog[open] button', 'Banking and payouts');
  await route(page, '/admin-preview/payouts?organisation=north-fixture');
  await heading(page, 'Organiser payouts');
  assert.equal(await page.$eval('nav[aria-label="Payout views"] button[aria-pressed="true"]', node => node.textContent), 'Payout requests');
});
