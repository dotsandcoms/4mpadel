import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';

let browser, directory, bundle;
const fixture = `
  import { createRoot } from 'react-dom/client';
  import PushBroadcastWorkspace from './src/pages/admin-preview/PushBroadcastWorkspace.jsx';
  import EmailBroadcastWorkspace from './src/pages/admin-preview/EmailBroadcastWorkspace.jsx';
  const actor = { id: 'fixture-admin', email: 'authorised-operator@example.test' };
  const player = { id: 15, name: 'Fictional operator', email: actor.email };
  const fingerprint = '11111111111111111111111111111111';
  const result = data => ({ data, error: null });
  window.calls = [];
  window.emailCalls = [];
  window.emailReads = [];
  window.crypto.randomUUID ??= () => '12340000-0000-4000-8000-000000000001';
  const client = {
    auth: { getUser: async () => result({ user: actor }) },
    from(table) {
      let offset = 0;
      let ids;
      window.emailReads.push(table);
      const query = {
        select() { return query; }, ilike() { return query; }, order() { return query; },
        in(_column, values) { ids = values.map(String); return query; },
        range(first) { offset = first; return query; }, abortSignal() { return query; },
        then(resolve) {
          const tables = {
            admin_sidebar_permissions: [{ email: actor.email, allowed_tabs: ['email-broadcast'], role: 'custom' }],
            calendar: [{ id: 61, event_name: 'Synthetic coastal open', start_date: '2030-01-15' }, { id: 62, event_name: 'Synthetic inland open' }],
            event_registrations: [
              { id: 1, event_id: 61, email: 'paid@example.test', payment_status: 'paid', partner_name: 'Fixture partner' },
              { id: 2, event_id: 61, email: 'pending@example.test', payment_status: 'pending' },
              { id: 3, event_id: 61, email: 'withdrawn@example.test', payment_status: 'paid', status: 'withdrawn' },
              { id: 4, event_id: 62, email: 'other-event@example.test', payment_status: 'paid' },
            ],
            tournament_participants: [{ id: 7, event_id: 61, email: 'PAID@example.test' }, { id: 8, event_id: 61, email: 'provider@example.test' }],
          };
          const rows = (tables[table] || []).filter(row => !ids || ids.includes(String(row.event_id ?? row.id)));
          resolve(result(rows.slice(offset)));
        },
      };
      return query;
    },
    functions: {
      async invoke(name, { body }) {
        if (name !== 'send-email') throw new Error('Unexpected fixture function');
        window.emailCalls.push(body);
        if (body.action === 'broadcast_capability') return window.emailReady ? result({ version: 1, batchSize: 49 }) : { data: null, error: new Error('Fictional old backend') };
        if (body.template === 'broadcast' && body.bcc.length === 1 && window.failSecondEmail) {
          window.failSecondEmail = false;
          return { data: null, error: new Error('Fictional network interruption') };
        }
        return result({ success: true, messageId: 'fictional-receipt' });
      },
    },
    async rpc(name, args = {}) {
      window.calls.push({ name, args });
      if (name === 'account_is_active') return result(window.active !== false);
      if (name === 'admin_push_broadcast_events') return result([{ id: 61, event_name: 'Synthetic event', start_date: null }]);
      if (name === 'admin_push_broadcast_players') return result([player]);
      if (name === 'preview_push_broadcast') {
        const ready = args.p_player_ids.includes(player.id) ? 1 : 0;
        return result({ total: ready, ready, disabled: 0, no_device: 0, fingerprint, recipients: ready ? [{ ...player, availability: 'ready' }] : [] });
      }
      if (name === 'list_push_broadcasts_page') return result({
        items: [{ id: 'history-' + args.p_page, title: 'Campaign page ' + args.p_page, body: 'Synthetic history', path: '/calendar',
          created_at: '2026-11-17T12:00:00Z', recipient_count: 1, pending: 0, sent: 1, skipped: 0, failed: 0 }],
        page: args.p_page, pages: 2, total: 8,
      });
      if (name === 'send_push_broadcast') {
        if (window.failFirstQueue) { window.failFirstQueue = false; throw new Error('Fictional network interruption.'); }
        return result({ id: args.p_request_id, total: 1, queued: 1 });
      }
      throw new Error('Unexpected fixture call ' + name);
    },
  };
  createRoot(document.getElementById('root')).render(window.useEmail
    ? <EmailBroadcastWorkspace client={client} session={{ user: actor }} scopeId="all" permissions={{ role: 'custom', allowed_tabs: ['email-broadcast'],
        orgs: window.emailTenant ? [{ id: 'own-only', member_role: 'admin' }] : [] }} />
    : <PushBroadcastWorkspace client={client} session={{ user: actor }} scopeId="all" />);
`;

before(async () => {
  directory = await mkdtemp(join(tmpdir(), '4m-design-broadcast-'));
  bundle = join(directory, 'fixture.js');
  await build({ stdin: { contents: fixture, resolveDir: process.cwd(), loader: 'jsx' },
    outfile: bundle, bundle: true, format: 'iife', platform: 'browser', jsx: 'automatic', define: { 'import.meta.env': '{}' },
    plugins: [{
      name: 'no-real-broadcasts',
      setup(builder) {
        builder.onResolve({ filter: /supabaseClient(?:\.js)?$/ }, () => ({ path: 'no-network', namespace: 'fixture' }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const supabase = null;'}));
      },
    }],
  });
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); if (directory) await rm(directory, { recursive: true, force: true }); });

async function click(page, label) {
  await page.waitForFunction(text => [...document.querySelectorAll('button')].some(button => !button.disabled && button.textContent.trim() === text), {}, label);
  await page.evaluate(text => [...document.querySelectorAll('button')].find(button => !button.disabled && button.textContent.trim() === text).click(), label);
}
async function enter(page, selector, text) {
  await page.$eval(selector, (field, value) => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value').set.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }, text);
}
test('New Admin Push retains history paging, self-test confirmation and idempotent broadcast retry', async () => {
  const page = await browser.newPage();
  page.setDefaultTimeout(7000);
  try {
    await page.setContent('<div id="root"></div>');
    await page.addScriptTag({ path: bundle });
    await page.waitForFunction(() => document.body.textContent.includes('Campaign page 1'));
    await click(page, 'Next');
    await page.waitForFunction(() => document.body.textContent.includes('Campaign page 2'));
    await enter(page, 'input[maxlength="80"]', 'Fictional push title');
    await enter(page, 'textarea[maxlength="500"]', 'Fictional push body');
    await click(page, 'Review test to me');
    await page.waitForSelector('dialog[open]');
    assert.equal(await page.evaluate(() => window.calls.some(call => call.name === 'send_push_broadcast')), false);
    await click(page, 'Send test to me');
    await page.waitForFunction(() => document.body.textContent.includes('Test notification queued for your account.'));
    const testPayload = await page.evaluate(() => window.calls.find(call => call.name === 'send_push_broadcast').args);
    assert.match(testPayload.p_title, /^Test:/);
    assert.deepEqual(testPayload.p_player_ids, [15]);

    await enter(page, 'input[autocomplete="off"]', 'fictional');
    await click(page, 'Add');
    await click(page, 'Review broadcast');
    await page.waitForSelector('dialog[open]');
    await page.evaluate(() => { window.failFirstQueue = true; });
    await click(page, 'Send push notification');
    await page.waitForFunction(() => document.body.textContent.includes('Fictional network interruption'));
    await click(page, 'Send push notification');
    await page.waitForFunction(() => document.body.textContent.includes('Broadcast queued for 1 player.'));
    const payloads = await page.evaluate(() => window.calls.filter(call => call.name === 'send_push_broadcast').slice(-2).map(call => call.args));
    assert.deepEqual(payloads[0], payloads[1]);
  } finally { await page.close(); }
});

test('revoked account cannot confirm its reviewed Push notification', async () => {
  const page = await browser.newPage();
  page.setDefaultTimeout(7000);
  try {
    await page.setContent('<div id="root"></div>');
    await page.addScriptTag({ path: bundle });
    await page.waitForFunction(() => document.body.textContent.includes('Campaign page 1'));
    await enter(page, 'input[maxlength="80"]', 'Fictional test');
    await enter(page, 'textarea[maxlength="500"]', 'Fictional body');
    await click(page, 'Review test to me');
    await page.waitForSelector('dialog[open]');
    await page.evaluate(() => { window.active = false; });
    await click(page, 'Send test to me');
    await page.waitForFunction(() => document.body.textContent.includes('An active account is required.'));
    assert.equal(await page.evaluate(() => window.calls.some(call => call.name === 'send_push_broadcast')), false);
  } finally { await page.close(); }
});

test('Email requires server capability and resumes an interrupted reviewed BCC delivery', async () => {
  const page = await browser.newPage();
  page.setDefaultTimeout(7000);
  try {
    await page.setContent('<div id="root"></div>');
    await page.evaluate(() => { window.useEmail = true; });
    await page.addScriptTag({ path: bundle });
    await page.waitForSelector('input[placeholder="Your announcement…"]');
    await enter(page, 'input[placeholder="Your announcement…"]', 'Fictional reviewed announcement');
    await page.$eval('[aria-label="Broadcast message"]', editor => {
      editor.innerHTML = '<p>Fictional announcement body</p>';
      editor.dispatchEvent(new InputEvent('input', { bubbles: true }));
    });
    await enter(page, 'textarea[rows="2"]', 'test-reader@example.test');
    await click(page, 'Review test');
    await page.waitForFunction(() => document.body.textContent.includes('Secure email delivery is unavailable.'));
    assert.equal(await page.evaluate(() => window.emailCalls.some(call => call.template === 'broadcast')), false);
    await page.evaluate(() => { window.emailReady = true; });
    await click(page, 'Check delivery access');
    await click(page, 'Send test email');
    await page.waitForFunction(() => document.body.textContent.includes('Email accepted by the provider for 1 recipient.'));
    assert.deepEqual(await page.evaluate(() => window.emailCalls.find(call => call.template === 'broadcast').bcc), ['test-reader@example.test']);

    await page.evaluate(() => [...document.querySelectorAll('label')].find(label => label.textContent.trim() === 'Include a manual email list').querySelector('input').click());
    await page.waitForSelector('textarea[rows="3"]');
    await enter(page, 'textarea[rows="3"]', Array.from({ length: 50 }, (_, index) => 'reader' + index + '@example.test').join(','));
    await click(page, 'Review broadcast');
    await page.evaluate(() => { window.failSecondEmail = true; });
    await click(page, 'Send broadcast');
    await page.waitForFunction(() => document.body.textContent.includes('The provider accepted 1 earlier batch.'));
    await click(page, 'Send broadcast');
    await page.waitForFunction(() => document.body.textContent.includes('Email accepted by the provider for 50 recipients.'));
    const deliveries = await page.evaluate(() => window.emailCalls.filter(call => call.template === 'broadcast').slice(1));
    assert.deepEqual(deliveries.map(delivery => delivery.bcc.length), [49, 1, 1]);
    assert.equal(deliveries[1].broadcastRequestId, deliveries[2].broadcastRequestId);
  } finally { await page.close(); }
});

test('Email audience controls select, filter, remove, restore and reset reviewed event recipients', async () => {
  const page = await browser.newPage();
  page.setDefaultTimeout(7000);
  const names = () => page.$$eval('.email-broadcast-recipient-list li > span', rows => rows.map(row => row.textContent));
  const count = value => page.waitForFunction(total => document.querySelector('.email-broadcast-count')?.textContent === total, {}, String(value));
  try {
    await page.setContent('<div id="root"></div>');
    await page.evaluate(() => { window.useEmail = true; });
    await page.addScriptTag({ path: bundle });
    await page.waitForSelector('.email-broadcast-events input');
    await enter(page, 'input[placeholder="Event name…"]', 'coastal');
    assert.equal(await page.$$eval('.email-broadcast-events label', rows => rows.length), 1);
    await page.click('.email-broadcast-events input');
    await count(3);
    await click(page, 'Review recipients');
    assert.deepEqual(await names(), ['paid@example.test','pending@example.test','provider@example.test']);
    await page.click('[aria-label="Remove pending@example.test"]');
    await count(2);
    await click(page, 'Restore removed recipients');
    await count(3);
    await page.select('.email-broadcast-filters label:first-child select', 'paid');
    await count(1);
    assert.deepEqual(await names(), ['paid@example.test']);
    await page.select('.email-broadcast-filters label:last-child select', 'solo');
    await count(0);
    await click(page, 'Reload events and audience');
    await count(0);
    await click(page, 'Reset draft');
    await click(page, 'Keep draft');
    assert.ok(await page.$eval('.email-broadcast-events input', input => input.checked));
    await click(page, 'Reset draft');
    await click(page, 'Discard draft');
    await count(0);
    assert.equal(await page.$$eval('.email-broadcast-events input', inputs => inputs.some(input => input.checked)), false);
    assert.equal(await page.evaluate(() => window.emailCalls.length), 0);
  } finally { await page.close(); }
});

test('an organisation with a stale broadcast tab cannot load the email audience or use a send button', async () => {
  const page = await browser.newPage();
  try {
    await page.setContent('<div id="root"></div>');
    await page.evaluate(() => { window.useEmail = true; window.emailTenant = true; });
    await page.addScriptTag({ path: bundle });
    await page.waitForSelector('[role=alert]');
    assert.match(await page.$eval('[role=alert]', node => node.textContent), /Platform Email Broadcast access is required/);
    assert.equal(await page.$('.email-broadcast button'), null);
    assert.deepEqual(await page.evaluate(() => [window.emailReads, window.emailCalls]), [[], []]);
  } finally { await page.close(); }
});
