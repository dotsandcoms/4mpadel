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
            admin_sidebar_permissions: [{ email: actor.email, allowed_tabs: window.emailFinance ? ['email-broadcast','finance'] : ['email-broadcast'],
              role: window.emailPlatform ? 'super_admin' : 'custom',
              module_permissions: window.emailFinance ? { finance:{ allowedEvents:[61] } } : {} }],
            calendar: [{ id: 61, event_name: 'Synthetic coastal open', start_date: '2030-01-15' }, { id: 62, event_name: 'Synthetic inland open' }],
            event_registrations: [
              { id: 1, event_id: 61, email: 'paid@example.test', payment_status: 'paid', partner_name: 'Fixture partner' },
              { id: 2, event_id: 61, email: 'pending@example.test', payment_status: 'pending' },
              { id: 3, event_id: 61, email: 'withdrawn@example.test', payment_status: 'paid', status: 'withdrawn' },
              { id: 4, event_id: 62, email: 'other-event@example.test', payment_status: 'paid' },
            ],
            tournament_participants: [{ id: 7, event_id: 61, email: 'PAID@example.test' }, { id: 8, event_id: 61, email: 'provider@example.test' }],
          };
          if (table === 'tournament_participants' && window.emailProviderReadFails) {
            resolve({ data:null, error:new Error('Fictional roster read failed') });
            return;
          }
          const rows = (tables[table] || []).filter(row => (!ids || ids.includes(String(row.event_id ?? row.id)))
            && !(table === 'event_registrations' && window.emailRemovePending && row.email === 'pending@example.test'));
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
      if (name === 'is_super_admin') return result(window.emailPlatform === true);
      if (name === 'can_manage_event') return result(String(args.p_event_id) === window.emailManagedEvent);
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
    ? <EmailBroadcastWorkspace client={client} session={{ user: actor }} scopeId="all" permissions={{ role: window.emailPlatform ? 'super_admin' : 'custom', allowed_tabs: ['email-broadcast'],
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

test('a browser reload retains batch IDs for the same reviewed BCC delivery without saving its content', async () => {
  const page = await browser.newPage();
  const fixtureUrl = 'https://broadcast-fixture.test/';
  const recipients = Array.from({ length: 50 }, (_, index) => 'retry-reader' + index + '@example.test');
  page.setDefaultTimeout(7000);
  try {
    await page.setRequestInterception(true);
    page.on('request', request => request.url() === fixtureUrl
      ? request.respond({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' })
      : request.abort());
    page.on('dialog', dialog => void dialog.accept());
    const reconstruct = async addresses => {
      await page.evaluate(() => { window.useEmail = true; window.emailReady = true; });
      await page.addScriptTag({ path: bundle });
      await page.waitForSelector('input[placeholder="Your announcement…"]');
      await enter(page, 'input[placeholder="Your announcement…"]', 'Fictional retry subject');
      await page.$eval('[aria-label="Broadcast message"]', editor => {
        editor.innerHTML = '<p>Fictional retry content</p>';
        editor.dispatchEvent(new InputEvent('input', { bubbles: true }));
      });
      await page.evaluate(() => [...document.querySelectorAll('label')].find(label => label.textContent.trim() === 'Include a manual email list').querySelector('input').click());
      await page.waitForSelector('textarea[rows="3"]');
      await enter(page, 'textarea[rows="3"]', addresses.join(','));
      await click(page, 'Review broadcast');
    };

    await page.goto(fixtureUrl);
    await reconstruct(recipients);
    await page.evaluate(() => { window.failSecondEmail = true; });
    await click(page, 'Send broadcast');
    await page.waitForFunction(() => document.body.textContent.includes('The provider accepted 1 earlier batch.'));
    const first = await page.evaluate(() => window.emailCalls.filter(call => call.template === 'broadcast'));
    assert.equal(first.length, 2);
    assert.notEqual(first[0].broadcastRequestId, first[1].broadcastRequestId);
    const saved = await page.evaluate(() => Object.entries(sessionStorage).filter(([key]) => key.startsWith('4m-admin:email-review:')));
    assert.equal(saved.length, 1);
    assert.match(saved[0][0], /^4m-admin:email-review:[a-f0-9]{64}$/);
    assert.deepEqual(Object.keys(JSON.parse(saved[0][1])).sort(), ['batchIds', 'startedAt']);
    assert.doesNotMatch(JSON.stringify(saved), /retry-reader|Fictional retry/);

    await page.reload();
    await reconstruct([...recipients].reverse());
    await click(page, 'Send broadcast');
    await page.waitForFunction(() => document.body.textContent.includes('Email accepted by the provider for 50 recipients.'));
    const retried = await page.evaluate(() => window.emailCalls.filter(call => call.template === 'broadcast'));
    assert.deepEqual(retried, first);
    assert.equal(await page.evaluate(() => Object.keys(sessionStorage).some(key => key.startsWith('4m-admin:email-review:'))), false);
  } finally { await page.close(); }
});

test('Email audience controls select, filter, remove, restore and reset reviewed event recipients', async () => {
  const page = await browser.newPage();
  page.setDefaultTimeout(7000);
  const names = () => page.$$eval('.email-broadcast-recipient-list li > span', rows => rows.map(row => row.textContent));
  const count = value => page.waitForFunction(total => document.querySelector('.email-broadcast-count')?.textContent === total, {}, String(value));
  try {
    await page.setContent('<div id="root"></div>');
    await page.evaluate(() => { window.useEmail = true; window.emailManagedEvent = '61'; });
    await page.addScriptTag({ path: bundle });
    await page.waitForSelector('.email-broadcast-events input');
    await enter(page, 'input[placeholder="Event name…"]', 'nonexistent');
    await page.waitForFunction(() => document.querySelector('section [role=status]')?.textContent === 'No events match your search.');
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

async function openBroadcast(t, options = {}) {
  const page = await browser.newPage();
  t.after(() => page.close());
  page.setDefaultTimeout(7000);
  await page.setRequestInterception(true);
  page.on('request', request => /^https?:/.test(request.url()) ? request.abort() : request.continue());
  await page.setContent('<div id="root"></div>');
  await page.evaluate(flags => Object.assign(window, { useEmail: true, emailReady: true, ...flags }), options);
  await page.addScriptTag({ path: bundle });
  await page.waitForSelector('.email-broadcast-events input');
  return page;
}
const audienceCount = (page, count) => page.waitForFunction(count => document.querySelector('.email-broadcast-count')?.textContent === String(count), {}, count);
const rowReads = page => page.evaluate(() => window.emailReads.filter(table => ['event_registrations','tournament_participants'].includes(table)));
const deliveries = page => page.evaluate(() => window.emailCalls.filter(call => call.template === 'broadcast'));
async function enterMessage(page) {
  await enter(page, 'input[placeholder="Your announcement…"]', 'Fictional campaign');
  await page.$eval('[aria-label="Broadcast message"]', editor => {
    editor.innerHTML = '<p>Fictional campaign content</p>';
    editor.dispatchEvent(new InputEvent('input', { bubbles: true }));
  });
}

test('a standalone broadcast grant cannot substitute a partial event audience for manual recipients', async t => {
  const page = await openBroadcast(t);
  await enterMessage(page);
  await page.evaluate(() => [...document.querySelectorAll('label')].find(label => label.textContent.trim() === 'Include a manual email list').querySelector('input').click());
  await enter(page, 'textarea[rows="3"]', 'manual@example.test');
  await page.click('.email-broadcast-events input');
  await audienceCount(page,'Unavailable');
  assert.deepEqual(await rowReads(page),[]);
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent === 'Review broadcast').disabled),true);
  await enter(page, 'textarea[rows="2"]', 'test-reader@example.test');
  await click(page,'Review test');
  await click(page,'Send test email');
  await audienceCount(page,'Unavailable');
  await click(page,'Clear selected events');
  await audienceCount(page,1);
  await click(page,'Review broadcast');
  await click(page,'Send broadcast');
  await page.waitForFunction(() => window.emailCalls.filter(call => call.template === 'broadcast').length === 2);
  assert.deepEqual((await deliveries(page)).map(call => call.bcc),[['test-reader@example.test'],['manual@example.test']]);
  assert.deepEqual(await rowReads(page),[]);
});

test('a Finance event grant permits only registration-filtered event audiences', async t => {
  const page = await openBroadcast(t, { emailFinance: true });
  await page.click('.email-broadcast-events input');
  await audienceCount(page,'Unavailable');
  assert.deepEqual(await rowReads(page),[]);
  await page.select('.email-broadcast-filters label:first-child select','paid');
  await audienceCount(page,1);
  assert.ok((await rowReads(page)).includes('event_registrations'));
  assert.equal((await rowReads(page)).includes('tournament_participants'),false);
  await page.evaluate(() => { window.emailReads = []; });
  await page.click('.email-broadcast-events label:nth-child(2) input');
  await audienceCount(page,'Unavailable');
  assert.deepEqual(await rowReads(page),[]);
});

test('platform confirmation stops when the exact event recipients change after review', async t => {
  const page = await openBroadcast(t, { emailPlatform: true });
  await enterMessage(page);
  await page.click('.email-broadcast-events input');
  await audienceCount(page,3);
  await click(page,'Review broadcast');
  await page.waitForSelector('section[aria-label="Broadcast review"]');
  await page.evaluate(() => { window.emailRemovePending = true; });
  await click(page,'Send broadcast');
  await page.waitForFunction(() => document.body.textContent.includes('The event audience changed.'));
  assert.deepEqual(await deliveries(page),[]);
  await audienceCount(page,2);
  assert.equal(await page.$('section[aria-label="Broadcast review"]'),null);
});

test('revoked event access clears the confirmed audience before any delivery', async t => {
  const page = await openBroadcast(t, { emailManagedEvent:'61' });
  await enterMessage(page);
  await page.click('.email-broadcast-events input');
  await audienceCount(page,3);
  await click(page,'Review recipients');
  await click(page,'Review broadcast');
  await page.waitForSelector('section[aria-label="Broadcast review"]');
  await page.evaluate(() => { window.emailManagedEvent = ''; window.emailReads = []; });
  await click(page,'Send broadcast');
  await audienceCount(page,'Unavailable');
  assert.equal(await page.$('.email-broadcast-recipient-list'),null);
  assert.deepEqual(await deliveries(page),[]);
  assert.deepEqual(await rowReads(page),[]);
});

test('a provider roster read failure discards the event recipient list as a whole', async t => {
  const page = await openBroadcast(t, { emailPlatform:true, emailProviderReadFails:true });
  await page.click('.email-broadcast-events input');
  await audienceCount(page,'Unavailable');
  assert.equal(await page.$('.email-broadcast-recipient-list'),null);
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent === 'Review broadcast').disabled),true);
  assert.deepEqual(await deliveries(page),[]);
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

test('Email links selected words in the existing message and keeps appending a separate link available', async t => {
  const page = await openBroadcast(t);
  const editor = '[aria-label="Broadcast message"]';
  const sentence = 'Visit the course notes before play.';
  await enter(page, 'input[placeholder="Your announcement…"]', 'Fixture announcement');
  await page.click(editor);
  await page.keyboard.type(sentence);
  await page.keyboard.press('Home');
  for (let index = 0; index < 'Visit the '.length; index++) await page.keyboard.press('ArrowRight');
  await page.keyboard.down('Shift');
  for (let index = 0; index < 'course notes'.length; index++) await page.keyboard.press('ArrowRight');
  await page.keyboard.up('Shift');
  assert.equal(await page.evaluate(() => document.getSelection().toString()), 'course notes');

  const input = 'input[type="url"]';
  await page.click(input);
  await enter(page, input, 'javascript:alert(1)');
  await click(page, 'Link selected text');
  await page.waitForFunction(() => document.body.textContent.includes('Enter a valid http or https URL.'));
  assert.equal(await page.$(editor+' a'), null);

  await enter(page, input, 'https://example.test/course');
  await click(page, 'Link selected text');
  await page.waitForSelector(editor+' a[href="https://example.test/course"]');
  assert.equal(await page.$eval(editor, node => node.textContent), sentence);
  assert.equal(await page.$eval(editor+' a', node => node.textContent), 'course notes');

  await enter(page, input, 'https://example.test/fixtures');
  await click(page, 'Add link');
  await page.waitForSelector(editor+' a[href="https://example.test/fixtures"]');
  assert.deepEqual(await page.$$eval(editor+' a', anchors => anchors.map(anchor => anchor.textContent)),
    ['course notes', 'https://example.test/fixtures']);

  await page.evaluate(() => [...document.querySelectorAll('label')].find(label => label.textContent.trim() === 'Include a manual email list').querySelector('input').click());
  await enter(page, 'label textarea[rows="3"]', 'manual@example.test');
  await click(page, 'Review broadcast');
  await page.waitForSelector('.email-broadcast-preview a[href="https://example.test/course"]');
  assert.equal(await page.$eval('.email-broadcast-preview a', anchor => anchor.textContent), 'course notes');
  assert.deepEqual(await deliveries(page), []);
});
