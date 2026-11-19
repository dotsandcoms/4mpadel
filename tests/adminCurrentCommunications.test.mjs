import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';

const firstTicket = '20000000-0000-0000-0000-000000000001';
const secondTicket = '20000000-0000-0000-0000-000000000002';
let directory, bundle, browser;

const fixture = `
  import { createRoot } from 'react-dom/client';
  import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
  import { CurrentHelp, CurrentMessaging, CurrentSecurity } from './src/pages/admin-preview/current/CurrentCommunications.jsx';
  import { session } from './src/supabaseClient.js';

  window.crypto.randomUUID ??= () => 'fictional-request-key';

  function Workspace() {
    const location = useLocation();
    const navigate = useNavigate();
    const path = location.pathname.split('/').at(-1);
    return <>
      <button onClick={() => navigate('/admin-preview/help?ticket=${secondTicket}&source=fixture#queue', { state: { from: 'second' } })}>Open second link</button>
      <button onClick={() => navigate('/admin-preview/messaging')}>Open messages</button>
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
    async rpc(name, { p_action: action, p_data: data }) {
      if (name === 'help_api') {
        window.helpCalls.push({ action, data });
        if (action === 'inbox') return result({ unread: 2, topics: [] });
        if (action === 'list') return result({ rows: [], next: null });
        if (action === 'status') statuses.set(data.id, data.status);
        if (action === 'escalate') teams.set(data.id, '4m');
        if (action === 'read') {
          const number = data.id === '${firstTicket}' ? 1 : 2;
          return result({ request: {
            id: data.id, reference: '4M-TEST-' + number, requester: { name: 'Fictional player' },
            topic: 'entry', eventName: 'Fictional event ' + number, status: statuses.get(data.id) || 'open',
            team: teams.get(data.id) || 'organiser', recipient: 'Fictional support', createdAt: '2026-11-16T07:10:00Z',
          }, messages: [{ id: 'fictional-message', role: 'player', body: 'Fictional question', createdAt: '2026-11-16T07:10:00Z' }] });
        }
        return result({});
      }
      if (name === 'messaging_event_directory' || action === 'admin_scopes') return result([]);
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

after(async () => {
  await browser?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function click(page, text) {
  await page.waitForFunction(label => [...document.querySelectorAll('button')].some(button => !button.disabled && button.textContent.trim() === label), {}, text);
  await page.evaluate(label => [...document.querySelectorAll('button')].find(button => !button.disabled && button.textContent.trim() === label).click(), text);
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
    await page.waitForFunction(() => document.body.textContent.includes('4M-TEST-1'));
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
    await click(page, '← All requests');
    await page.waitForSelector('table');
    assert.equal(await page.$eval('output', output => output.textContent), '?source=fixture#queue second');

    await click(page, 'Open messages');
    await click(page, 'Player messages');
    await page.waitForSelector('.pm-inbox');
    await click(page, 'Open security');
    await page.waitForFunction(() => document.body.textContent.includes('Verify to recover another account'));
    await click(page, 'Open delegated view');
    await page.waitForFunction(() => !document.body.textContent.includes('Verify to recover another account'));
    assert.match(await page.$eval('[aria-label="Account security"]', panel => panel.textContent), /operator@example.test.*Primary phone/s);
  } finally {
    await page.close();
  }
});
