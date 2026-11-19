import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';

const firstTicket = '20000000-0000-0000-0000-000000000001';
const secondTicket = '20000000-0000-0000-0000-000000000002';
const personalTicket = '20000000-0000-0000-0000-000000000003';
let directory, bundle, browser;

const fixture = `
  import { createRoot } from 'react-dom/client';
  import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
  import CurrentHelp from './src/pages/admin-preview/HelpRequestsWorkspace.jsx';
  import CurrentMessaging from './src/pages/admin-preview/MessagingWorkspace.jsx';
  import CurrentSecurity from './src/pages/admin-preview/AccountSecurityWorkspace.jsx';
  import { session } from './src/supabaseClient.js';

  window.crypto.randomUUID ??= () => 'fictional-request-key';

  function Workspace() {
    const location = useLocation();
    const navigate = useNavigate();
    const path = location.pathname.split('/').at(-1);
    return <>
      <button onClick={() => navigate('/admin-preview/help?ticket=${secondTicket}&source=fixture#queue', { state: { from: 'second' } })}>Open second link</button>
      <button onClick={() => navigate('/admin-preview/help?ticket=${personalTicket}')}>Open personal link</button>
      <button onClick={() => navigate('/admin-preview/messaging')}>Open messages</button>
      <button onClick={() => navigate('/admin-preview/messaging?event=101')}>Open authorised event</button>
      <button onClick={() => navigate('/admin-preview/messaging?event=202')}>Open other event</button>
      <button onClick={() => navigate('/admin-preview/help?event=101')}>Open event Help</button>
      <button onClick={() => navigate('/admin-preview/security')}>Open security</button>
      <button onClick={() => navigate('/admin-preview/security?view=other')}>Open delegated view</button>
      <output aria-label="Router location">{location.search}{location.hash} {location.state?.from}</output>
      {path === 'help' && <CurrentHelp session={session} />}
      {path === 'messaging' && <CurrentMessaging session={session} />}
      {path === 'security' && <CurrentSecurity session={session} permissions={{ role: 'super_admin' }} targetEmail={location.search ? 'other@example.test' : session.user.email} />}
    </>;
  }

  createRoot(document.getElementById('root')).render(
    <MemoryRouter initialEntries={['/admin-preview/help?ticket=${firstTicket}&source=fixture#queue']}><Workspace /></MemoryRouter>,
  );
`;

const mockClient = `
  export const session = { user: { id: 'fictional-operator', email: 'operator@example.test' }, access_token: 'fake' };
  const factors = [{ id: 'fictional-factor', factor_type: 'totp', status: 'verified', friendly_name: 'Primary phone' }];
  const result = data => ({ data, error: null });
  const listeners = new Set();
  const statuses = new Map(), teams = new Map();
  let verified = false;
  window.helpCalls = [];
  window.messagingCalls = [];

  export const supabase = {
    realtime: { setAuth: async () => {} },
    channel() {
      const channel = { on: () => channel, subscribe: () => channel };
      return channel;
    },
    removeChannel: async () => {},
    auth: {
      getSession: async () => result({ session }),
      onAuthStateChange(listener) {
        listeners.add(listener);
        queueMicrotask(() => { if (listeners.has(listener)) listener('INITIAL_SESSION', session); });
        return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } };
      },
      mfa: {
        getAuthenticatorAssuranceLevel: async () => result({ currentLevel: verified ? 'aal2' : 'aal1' }),
        listFactors: async () => result({ totp: factors, all: factors }),
        challengeAndVerify: async () => { verified = true; return result({}); },
      },
    },
    async rpc(name, { p_action: action, p_data: data, p_event: eventId }) {
      if (name === 'help_api') {
        window.helpCalls.push({ action, data });
        if (action === 'inbox') return result({ unread: 2, topics: [] });
        if (action === 'list') return result({ rows: [], next: null });
        if (action === 'status') statuses.set(data.id, data.status);
        if (action === 'escalate') teams.set(data.id, '4m');
        if (action === 'read') {
          const number = data.id === '${firstTicket}' ? 1 : data.id === '${secondTicket}' ? 2 : 3;
          const organisation = number === 1 ? 'North Court' : 'South Court';
          const canManage = !window.helpActorOrganisation || organisation === window.helpActorOrganisation || data.id === window.helpAssignedTicket;
          if (!canManage && number !== 3) return { error: { code: '42501', message: 'This help request is unavailable.' } };
          return result({ request: {
            id: data.id, reference: '4M-TEST-' + number, requester: { name: 'Fictional player' },
            canManage,
            topic: 'entry', eventId: number === 1 ? 101 : 202, eventName: organisation + ' event', status: statuses.get(data.id) || 'open',
            team: teams.get(data.id) || 'organiser', recipient: 'Fictional support', createdAt: '2026-11-16T07:10:00Z',
          }, messages: [{ id: 'fictional-message', role: 'player', body: 'Fictional question', createdAt: '2026-11-16T07:10:00Z' }] });
        }
        return result({});
      }
      window.messagingCalls.push({ name, action, data, eventId });
      const event = { id: 101, title: 'North Court event', organisation: 'North Court', postingOpen: true };
      if (name === 'messaging_event_directory') return result([event]);
      if (name === 'messaging_event_analytics') return eventId === 101
        ? result({ event, summary: { audience: 4, announcements: 1 }, announcements: [] })
        : { error: { code: '42501', message: 'Event messaging access denied.' } };
      if (action === 'open_event') return result([{ id: 'fixture-announcements', kind: 'event_announcements', manager: true, canSend: true }]);
      if (action === 'audience') return result({ allCount: 4, selectedCount: 2, divisions: [{ id: 'division-1', name: 'Open mixed', count: 2 }] });
      if (action === 'read') return result({ messages: [], next: null });
      if (action === 'send') return result({});
      if (action === 'admin_scopes') return result([]);
      if (name === 'messaging_admin_inbox') return result({ rows: [], next: null });
      if (action === 'status') return result({ enabled: true, rulesAccepted: true, groupsEnabled: true });
      throw new Error('Unexpected synthetic RPC: ' + name + ' ' + action);
    },
  };
`;

before(async () => {
  directory = await mkdtemp(join(tmpdir(), '4m-current-communications-'));
  bundle = join(directory, 'fixture.js');
  await build({
    stdin: { contents: fixture, resolveDir: process.cwd(), loader: 'jsx' },
    outfile: bundle,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    define: { 'import.meta.env': '{}' },
    plugins: [{
      name: 'synthetic-communications-client',
      setup(builder) {
        builder.onResolve({ filter: /supabaseClient(?:\.js)?$/ }, () => ({ path: 'client', namespace: 'synthetic' }));
        builder.onLoad({ filter: /.*/, namespace: 'synthetic' }, () => ({ contents: mockClient, loader: 'js' }));
      },
    }],
  });
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
});

test('an organiser can open its own Help queue and explicitly assigned events while other staff tickets stay private', async () => {
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  try {
    await page.setContent('<div id="root"></div>');
    await page.evaluate(() => { window.helpActorOrganisation = 'North Court'; });
    await page.addScriptTag({ path: bundle });
    const code = 'input[name="messaging-authenticator-code"]';
    await page.waitForSelector(code);
    await page.type(code, '123456');
    await click(page, 'Verify code');
    await waitForTicket(page, 'North Court event');
    await page.waitForFunction(id => window.helpCalls.some(call => call.action === 'mark_read' && call.data.id === id), {}, firstTicket);
    await click(page, 'Open second link');
    await page.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent === 'This help request is unavailable.');
    await click(page, 'Open personal link');
    await page.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent.includes('unavailable for your staff access'));
    assert.doesNotMatch(await page.$eval('body', body => body.textContent), /South Court event|Fictional question|Send reply|Send to 4M support/);
    assert.equal(await page.evaluate(id => window.helpCalls.some(call => call.data.id !== id && ['mark_read', 'reply', 'status', 'escalate'].includes(call.action)), firstTicket), false);
    assert.equal(await page.evaluate(() => window.helpCalls.filter(call => call.action === 'list').every(call => call.data.staff === true)), true);

    await page.evaluate(id => { window.helpAssignedTicket = id; }, secondTicket);
    await click(page, 'Open second link');
    await page.waitForFunction(() => document.body.textContent.includes('South Court event'));
    await page.evaluate(() => { window.helpAssignedTicket = null; });
    await click(page, 'Refresh');
    await page.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent === 'This help request is unavailable.');
    assert.doesNotMatch(await page.$eval('body', body => body.textContent), /South Court event|Fictional question|Send reply/);
  } finally {
    await page.close();
  }
});

after(async () => {
  await browser?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function click(page, text) {
  await page.waitForFunction(label => [...document.querySelectorAll('button')].some(button => !button.disabled && button.textContent.trim() === label), {}, text);
  await page.evaluate(label => [...document.querySelectorAll('button')].find(button => !button.disabled && button.textContent.trim() === label).click(), text);
}

async function waitForTicket(page, text) {
  try {
    await page.waitForFunction(expected => document.body.textContent.includes(expected), {}, text);
  } catch (error) {
    const state = await page.evaluate(() => ({ visible: document.body.textContent, calls: window.helpCalls }));
    throw new Error('Synthetic Help fixture did not display ' + text + ': ' + JSON.stringify(state), { cause: error });
  }
}

test('new Admin uses verified current workflows and preserves Help ticket navigation', async () => {
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  try {
    await page.setContent('<div id="root"></div>');
    await page.addScriptTag({ path: bundle });
    const code = 'input[name="messaging-authenticator-code"]';
    await page.waitForSelector(code);
    assert.equal(await page.evaluate(() => window.helpCalls.some(call => call.action === 'read')), false);
    await page.type(code, '123456');
    await click(page, 'Verify code');
    await waitForTicket(page, '4M-TEST-1');
    await page.type('#help-reply', 'Synthetic reply');
    await click(page, 'Send reply');
    await page.waitForFunction(() => window.helpCalls.some(call => call.action === 'reply'));
    await click(page, 'Mark resolved');
    await click(page, 'Reopen request');
    await click(page, 'Send to 4M support');
    await page.waitForFunction(() => window.helpCalls.some(call => call.action === 'escalate'));

    await click(page, 'Open second link');
    await page.waitForFunction(() => document.body.textContent.includes('4M-TEST-2'));
    assert.doesNotMatch(await page.$eval('body', body => body.textContent), /4M-TEST-1/);
    await click(page, 'All requests');
    await page.waitForSelector('table');
    assert.equal(await page.$eval('output', output => output.textContent), '?source=fixture#queue second');

    await click(page, 'Open messages');
    await click(page, 'Player messages');
    await page.waitForSelector('[aria-label="Player conversations"]');
    await click(page, 'Open security');
    await page.waitForFunction(() => document.body.textContent.includes('Verify to recover another account'));
    await click(page, 'Open delegated view');
    await page.waitForFunction(() => !document.body.textContent.includes('Verify to recover another account'));
    assert.match(await page.$eval('[aria-label="Account security"]', panel => panel.textContent), /operator@example.test.*Primary phone/s);
  } finally {
    await page.close();
  }
});

test('event shortcuts open managed messaging and scope Help to the originating event', async () => {
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  try {
    await page.setContent('<div id="root"></div>');
    await page.addScriptTag({ path: bundle });
    const code = 'input[name="messaging-authenticator-code"]';
    await page.waitForSelector(code);
    await page.type(code, '123456');
    await click(page, 'Verify code');
    await waitForTicket(page, 'North Court event');

    await click(page, 'Open event Help');
    await page.waitForFunction(() => window.helpCalls.some(call => call.action === 'list' && call.data.eventId === '101' && call.data.staff));
    await click(page, 'All events');
    assert.equal(await page.$eval('output', output => output.textContent.trim()), '');

    await click(page, 'Open authorised event');
    await page.waitForFunction(() => window.messagingCalls.some(call => call.action === 'audience'));
    await page.type('#em-message', 'Fictional fixture announcement');
    await click(page, 'Review message');
    assert.equal(await page.evaluate(() => window.messagingCalls.some(call => call.action === 'send')), false);
    await click(page, 'Publish announcement');
    await page.waitForFunction(() => window.messagingCalls.some(call => call.action === 'send' && call.data.conversationId === 'fixture-announcements'));

    await click(page, 'Open other event');
    await page.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent.includes('Event messaging access denied.'));
    assert.equal(await page.evaluate(() => window.messagingCalls.some(call => call.action === 'open_event' && call.data.eventId === 202)), false);
    assert.doesNotMatch(await page.$eval('body', body => body.textContent), /Fictional fixture announcement/);
  } finally {
    await page.close();
  }
});
