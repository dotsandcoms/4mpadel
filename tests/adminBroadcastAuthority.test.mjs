import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { transform } from 'esbuild';
import * as authority from '../supabase/functions/send-email/broadcast-authority.mjs';

const { emailBroadcastAuthorized, reviewedBroadcastBatch } = authority;

function fixture({
  email = 'editor%_@example.test', id = 'fictional-actor', active = true, superAdmin = false, rows = [],
  memberships = {}, players = [], creator = [], lookupError, authError, permissionError,
} = {}) {
  const calls = [];
  const caller = {
    auth: { async getUser() { return { data: { user: { email, id } }, error: authError }; } },
    async rpc(name, args) {
      calls.push([name, args]);
      if (name === 'account_is_active') return { data: active };
      if (name === 'is_super_admin') return { data: superAdmin, error: permissionError };
      throw new Error('Unexpected fixture RPC');
    },
  };
  const admin = { from(table) { return { select(columns) {
    const query = {
      async ilike(column, pattern) {
        calls.push([table, columns, column, pattern]);
        if (lookupError === table) return { error: new Error('Fixture unavailable') };
        return { data: table === 'admin_sidebar_permissions' ? rows : table === 'players' ? players : memberships[table] || [] };
      },
      eq() { return query; },
      async limit() { return { data: creator }; },
    };
    return query;
  } }; } };
  return { caller, admin, calls };
}

test('broadcast authorization permits current exact grants and platform authority', async () => {
  const delegated = fixture({ rows: [{ email: 'EDITOR%_@example.test', allowed_tabs: ['email-broadcast'] }] });
  assert.equal(await emailBroadcastAuthorized(delegated.caller, delegated.admin), true);
  assert.match(delegated.calls.find(([table]) => table === 'admin_sidebar_permissions').at(-1), /editor\\%\\_/);
  const platform = fixture({ superAdmin: true });
  assert.equal(await emailBroadcastAuthorized(platform.caller, platform.admin), true);
});

test('scoped organisation, club, federation and legacy ownership cannot send platform email with a broadcast tab', async () => {
  const email = 'editor%_@example.test';
  const rows = [{ email, allowed_tabs: ['email-broadcast'] }];
  for (const table of ['organisation_members', 'club_members', 'federation_members']) {
    const scoped = fixture({ rows, memberships: { [table]: [{ user_email: email.toUpperCase() }] } });
    assert.equal(await emailBroadcastAuthorized(scoped.caller, scoped.admin), false, table);
  }
  const legacy = fixture({ rows, players: [{ id: 15, email }], creator: [{ id: 16 }] });
  assert.equal(await emailBroadcastAuthorized(legacy.caller, legacy.admin), false);
  const failed = fixture({ rows, lookupError: 'organisation_members' });
  assert.equal(await emailBroadcastAuthorized(failed.caller, failed.admin), false);
  const platform = fixture({ superAdmin: true, memberships: { club_members: [{ user_email: email }] } });
  assert.equal(await emailBroadcastAuthorized(platform.caller, platform.admin), true);
});

test('inactive, unauthenticated and unrelated admin accounts fail closed', async () => {
  for (const options of [
    { active: false, superAdmin: true },
    { permissionError: { message: 'Unavailable' }, superAdmin: true },
    { authError: { message: 'Signed out' } },
    { rows: [{ email: 'editor%_@example.test', allowed_tabs: ['calendar'] }] },
    { rows: [{ email: 'editornorth@example.test', allowed_tabs: ['email-broadcast'] }] },
    { rows: [{ email: 'editor%_@example.test', allowed_tabs: ['email-broadcast'] }, { email: 'EDITOR%_@example.test', allowed_tabs: ['email-broadcast'] }] },
  ]) {
    const mocked = fixture(options);
    assert.equal(await emailBroadcastAuthorized(mocked.caller, mocked.admin), false);
  }
  assert.equal(await emailBroadcastAuthorized(null, fixture().admin), false);
});

const handlerSource = (await readFile('supabase/functions/send-email/index.ts', 'utf8')).replace(/^import .*;\n/gm, '');
const { code: handlerCode } = await transform(handlerSource, { loader: 'ts', format: 'cjs' });
const requestId = '10000000-0000-4000-8000-000000000001';
const batch = { template: 'broadcast', broadcastRequestId: requestId, bcc: ['READER@example.test'],
  variables: { subject: 'Reviewed subject', message: '<p>Reviewed message</p>' } };

function endpoint({ sender, ...permissions } = {}) {
  const mock = fixture(permissions);
  const deliveries = [], queued = [];
  const lookup = mock.admin.from;
  mock.admin.from = table => table === 'email_queue' ? {
    insert(row) {
      queued.push(row);
      return { select: () => ({ maybeSingle: async () => ({ data: { id: 'audit-row' } }) }) };
    },
    update: () => ({ eq: async () => ({}) }),
  } : lookup(table);
  let handle;
  runInNewContext(handlerCode, {
    ...authority,
    exports: {}, Response, Request,
    serve: fn => { handle = fn; },
    createClient: (_url, key) => key === 'provider-server-key' ? mock.admin : mock.caller,
    registrationEmailAllowed: async () => true,
    Deno: { env: { get: name => ({
      SUPABASE_URL: 'https://fixture.test', SUPABASE_ANON_KEY: 'fixture-publishable',
      SUPABASE_SERVICE_ROLE_KEY: 'provider-server-key', RESEND_API_KEY: 'fixture-provider', RESEND_VERIFIED_SENDER: sender,
    })[name] } },
    fetch: async (_url, { headers, body }) => {
      deliveries.push({ headers, body: JSON.parse(body) });
      return new Response('{"id":"provider-fixture-id"}');
    },
    console: { info() {}, warn() {}, error() {} },
  });
  return { deliveries, queued, post(body, authorization = 'Bearer test-user') {
    return handle(new Request('https://fixture.test/send-email', {
      method: 'POST', headers: authorization ? { Authorization: authorization } : {}, body: JSON.stringify(body),
    }));
  } };
}

test('the deployed handler contract checks capability without sending and forwards the same provider key on a retry', async () => {
  const edge = endpoint({ superAdmin: true });
  const capability = await edge.post({ action: 'broadcast_capability' });
  assert.equal(capability.status, 200);
  assert.deepEqual(await capability.json(), { version: 1, batchSize: 49 });
  assert.deepEqual(edge.deliveries, []);
  assert.deepEqual(edge.queued, []);
  for (let i = 0; i < 2; i++) {
    const response = await edge.post(batch);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true, messageId: 'provider-fixture-id' });
  }
  assert.equal(edge.deliveries.length, 2);
  assert.equal(edge.deliveries[0].headers['Idempotency-Key'], 'reviewed-email-broadcast/' + requestId);
  assert.deepEqual(edge.deliveries[0], edge.deliveries[1]);
  assert.deepEqual(edge.deliveries[0].body.bcc, ['reader@example.test']);
  assert.equal(edge.deliveries[0].body.to.length, 1);
  const legacy = await edge.post({ ...batch, broadcastRequestId: undefined });
  assert.equal(legacy.status, 200);
  assert.equal(edge.deliveries[2].headers['Idempotency-Key'], undefined);
});

test('denied actor, malformed review and sandbox sender stop before queue or delivery', async () => {
  const cases = [
    [endpoint({ superAdmin: true, active: false }), batch, undefined, 403],
    [endpoint({ superAdmin: true }), batch, '', 403],
    [endpoint({ superAdmin: true }), { ...batch, to: 'unexpected@example.test' }, undefined, 400],
    [endpoint({ superAdmin: true, sender: 'onboarding@resend.dev' }), batch, undefined, 503],
    [endpoint({ superAdmin: true, sender: 'onboarding@resend.dev' }), { action: 'broadcast_capability' }, undefined, 503],
  ];
  for (const [edge, body, authorization, status] of cases) {
    assert.equal((await edge.post(body, authorization)).status, status);
    assert.deepEqual(edge.deliveries, []);
    assert.deepEqual(edge.queued, []);
  }
});

test('reviewed email requests accept a bounded, canonical BCC batch only', () => {
  const input = { id: '10000000-0000-4000-8000-000000000001', subject: 'Fictional subject', message: '<p>Example</p>', bcc: ['person@example.test'] };
  assert.equal(reviewedBroadcastBatch(input), true);
  for (const changed of [
    { to: 'unexpected@example.test' }, { id: 'old-request' }, { bcc: [] }, { bcc: ['valid@example.test', 'VALID@example.test'] },
    { bcc: Array.from({length: 50}, (_, index) => `person${index}@example.test`) }, { bcc: ['broken email'] }, { subject: 'Unsafe\nheader' },
  ]) assert.equal(reviewedBroadcastBatch({ ...input, ...changed }), false);
});
