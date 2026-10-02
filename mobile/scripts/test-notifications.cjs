const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
function moduleAt(path, mocks = {}) {
  const exports = {};
  const context = { exports, URLSearchParams, require: name => mocks[name] ?? {}, console, process: { env: {} } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return exports;
}
const catalog = moduleAt('src/lib/notification-events.ts');
const policy = moduleAt('supabase/functions/deliver-push/policy.ts');
const now = Date.now();
const outbox = { email: 'player@example.com', type: 'event_cancelled', created_at: new Date(now).toISOString() };
const token = { email: 'PLAYER@example.com', token_kind: 'expo' };
test('delivery checks current preferences, account ownership and expiry', () => {
  assert.equal(policy.deliveryDecision(outbox, token, {}, now), null);
  assert.match(policy.deliveryDecision(outbox, token, { push_enabled: false }, now), /Disabled/);
  assert.match(policy.deliveryDecision(outbox, token, { event_cancelled: false }, now), /Disabled/);
  assert.match(policy.deliveryDecision(outbox, { ...token, email: 'other@example.com' }, {}, now), /belongs/);
  assert.match(policy.deliveryDecision(outbox, null, {}, now), /belongs/);
  assert.match(policy.deliveryDecision(outbox, token, {}, now + 86400001), /expired/);
});
test('retry delay is exponential and bounded', () => {
  assert.equal(policy.retryDelay(1), 30000);
  assert.equal(policy.retryDelay(2), 60000);
  assert.equal(policy.retryDelay(20), 3600000);
});
const native = moduleAt('src/lib/notification-routing.ts', {
  './notification-events': catalog, 'react-native': { Platform: { OS: 'web' } },
});
test('push routes reject external, auth and prototype payloads', () => {
  for (const path of ['//evil.test', '/reset-password', '/calendar?redirect=evil', '/unknown', 'https://evil.test']) assert.equal(native.pathFromNotificationData({ path }), null);
  assert.equal(native.pathFromNotificationData({ type: '__proto__' }), null);
  assert.equal(native.pathFromNotificationData({ type: 'event_cancelled' }), '/calendar');
  assert.equal(native.pathFromNotificationData({ path: '/(tabs)/calendar' }), '/calendar');
});
test('every event has a route and nonempty notification copy', () => {
  for (const type of catalog.NOTIFICATION_TYPES) {
    assert.ok(catalog.NOTIFICATION_PATHS[type]);
    const copy = catalog.pushCopy(type);
    assert.ok(copy.title && copy.body, type);
  }
});
test('sign-out waits for token deregistration instead of silently retaining delivery', async () => {
  let signedOut = false;
  const auth = moduleAt('src/lib/auth.ts', {
    'react-native': { Platform: { OS: 'web' } },
    './notifications': { unregisterPushToken: async () => { throw new Error('offline'); } },
    './supabase': { supabase: { auth: { signOut: async () => { signedOut = true; return {}; } } } },
  });
  await assert.rejects(auth.signOut(), /offline/);
  assert.equal(signedOut, false);
});

test('tournament deep links accept scoped match routes and reject extra or duplicate parameters', () => {
  const id = '12345678-1234-1234-1234-123456789abc';
  assert.equal(native.pathFromNotificationData({ path: `/events/12?division=${id}&match=${id}` }), `/events/12?division=${id}&match=${id}`);
  assert.equal(native.pathFromNotificationData({ path: `/events/12?division=${id}&tab=Results` }), `/events/12?division=${id}&tab=Results`);
  for (const path of ['/events/12?redirect=https://evil.test', '/events/12?tab=Draws&tab=Results', '/events/12?match=bad', '/events/12/../reset-password', '/events/0']) {
    assert.equal(native.pathFromNotificationData({ path }), null, path);
  }
});
