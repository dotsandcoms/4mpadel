const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const ts = require('typescript');

function load(file, requireFn = () => ({}), globals = {}) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module: mod, exports: mod.exports, require: requireFn, __DEV__: false, console, ...globals });
  return mod.exports;
}
const events = load('src/lib/analytics-events.ts');
const plain = value => JSON.parse(JSON.stringify(value));
function harness({ storage = new Map(), fail = false } = {}) {
  const calls = [];
  const sdk = {
    configureAnalytics: async () => { calls.push(['configure']); if (fail) throw new Error('Unavailable SDK'); },
    sendAnalyticsEvent: async (name, params) => calls.push(['event', name, plain(params)]),
    sendAnalyticsScreen: async name => calls.push(['screen', name]),
    identifyAnalyticsUser: async id => calls.push(['user', id]),
    resetAnalytics: async () => calls.push(['reset']),
  };
  const app = load('src/lib/analytics.ts', name => {
    if (name === './firebase-analytics') return sdk;
    if (name === './analytics-events') return events;
    if (name === 'expo-crypto') return { CryptoDigestAlgorithm: { SHA256: 'sha256' }, digestStringAsync: async (_, text) => crypto.createHash('sha256').update(text).digest('hex') };
    if (name === '@react-native-async-storage/async-storage') return { __esModule: true, default: {
      getItem: async key => storage.get(key) ?? null,
      setItem: async (key, value) => storage.set(key, value),
      removeItem: async key => storage.delete(key),
    } };
    throw new Error('Unexpected dependency: ' + name);
  });
  return { app, calls, storage };
}

test('navigation emits readable screen names and never route IDs, query strings or recovery tokens', () => {
  assert.equal(events.analyticsScreen('(tabs)/(calendar)/events/[id]'), 'event_details');
  assert.equal(events.analyticsScreen('(tabs)/profile'), 'my_profile');
  assert.equal(events.analyticsScreen('(auth)/sign-in'), 'sign_in');
  assert.equal(events.analyticsScreen('reset-password?token=private'), 'other');
  assert.equal(events.analyticsScreen('players/private@example.com'), 'other');
});
test('event parameters drop personal details, arbitrary strings and unknown fields', () => {
  assert.deepEqual(plain(events.safeAnalyticsParams('login', {
    method: 'google', email: 'private@example.com', token: 'secret', name: 'Private Person',
  })), { method: 'google' });
  assert.deepEqual(plain(events.safeAnalyticsParams('search_performed', {
    content_type: 'events', search_term: 'private@example.com', result_count: 4, query_length: 19,
  })), { content_type: 'events', result_count: 4, query_length: 19 });
  assert.deepEqual(plain(events.safeAnalyticsParams('login', { method: 'private@example.com' })), {});
});
test('invalid or non-finite amounts and non-boolean flags never reach Analytics', () => {
  assert.deepEqual(plain(events.safeAnalyticsParams('begin_checkout', { value: NaN, currency: 'USD' })), {});
  assert.deepEqual(plain(events.safeAnalyticsParams('match_bookmark', { enabled: 'yes', notify: true })), { notify: true });
});
test('published content identifiers are allowed while personal IDs and arbitrary feature text are rejected', () => {
  assert.deepEqual(plain(events.safeAnalyticsParams('content_view', { content_type: 'events', content_id: 'event:123' })), { content_type: 'events', content_id: 'event:123' });
  assert.deepEqual(plain(events.safeAnalyticsParams('content_view', { content_type: 'events', content_id: 'user:b04b51ee-e6c2-4f9c-afb1-fecce623a713' })), { content_type: 'events' });
  assert.deepEqual(plain(events.safeAnalyticsParams('feature_interaction', { feature: 'media', action: 'photo_open', selection: 'private@example.com' })), { feature: 'media', action: 'photo_open' });
});
test('funnel steps, outcomes and notification preferences accept only known safe values', () => {
  assert.deepEqual(plain(events.safeAnalyticsParams('registration_step', { step: 5, flow: 'register', item_count: 2 })), { flow: 'register', item_count: 2 });
  assert.deepEqual(plain(events.safeAnalyticsParams('checkout_outcome', { item_category: 'entry_balance', status: 'unconfirmed', reference: 'private' })), { item_category: 'entry_balance', status: 'unconfirmed' });
  assert.deepEqual(plain(events.safeAnalyticsParams('notification_preference', { preference: 'payment_reminder', enabled: false, timezone: 'private' })), { preference: 'payment_reminder', enabled: false });
});

function searchHarness() {
  let pending, cleanup;
  const ref = { current: '' }, calls = [];
  const hook = load('src/hooks/use-analytics-search.ts', name => name === 'react' ? {
    useRef: () => ref, useEffect: effect => { cleanup = effect(); },
  } : { trackEvent: (name, params) => calls.push([name, plain(params)]) }, {
    setTimeout: fn => { pending = fn; return 1; }, clearTimeout: () => { pending = undefined; },
  });
  return { calls,
    render(...args) { cleanup?.(); hook.useAnalyticsSearch(...args); },
    settle() { const fn = pending; pending = undefined; fn?.(); },
    unmount() { cleanup?.(); },
  };
}
test('live search waits for a settled query and emits counts without the typed text', () => {
  const h = searchHarness(); h.render('p', 20, 'players'); h.settle();
  h.render('private@', 5, 'players'); h.render('private@example.com', 0, 'players');
  assert.equal(h.calls.length, 0); h.settle();
  assert.deepEqual(h.calls, [['search_performed', { content_type: 'players', query_length: 19, result_count: 0 }]]);
  assert.ok(!JSON.stringify(h.calls).includes('private@'));
});
test('search waits for loaded results and never reports a cancelled timer', () => {
  const h = searchHarness(); h.render('padel', 0, 'events', false); h.settle();
  assert.equal(h.calls.length, 0); h.render('padel', 8, 'events', true); h.settle();
  assert.equal(h.calls[0][1].result_count, 8);
  h.render('other', 3, 'events'); h.unmount(); h.settle(); assert.equal(h.calls.length, 1);
});
test('result refreshes do not double-count a query and clearing permits a new search', () => {
  const h = searchHarness(); h.render('padel', 3, 'events'); h.settle();
  h.render('padel', 4, 'events'); h.settle(); assert.equal(h.calls.length, 1);
  h.render('', 0, 'events'); h.render('padel', 4, 'events'); h.settle(); assert.equal(h.calls.length, 2);
});
test('initialization happens once, and identity is hashed and cleared on logout', async () => {
  const h = harness(), id = 'b04b51ee-e6c2-4f9c-afb1-fecce623a713';
  await h.app.setAnalyticsUser(id); await h.app.trackScreen('(tabs)/profile'); await h.app.setAnalyticsUser(null);
  assert.equal(h.calls.filter(row => row[0] === 'configure').length, 1);
  assert.match(h.calls.find(row => row[0] === 'user')[1], /^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(h.calls).includes(id));
  assert.deepEqual(h.calls.at(-1), ['user', null]);
});
test('SDK failure resolves without breaking navigation or a user action', async () => {
  const h = harness({ fail: true });
  await assert.doesNotReject(h.app.trackEvent('login', { method: 'password' }));
  await assert.doesNotReject(h.app.trackScreen('settings'));
  assert.equal(h.calls.filter(row => row[0] === 'event').length, 0);
});
test('unknown event names cannot leak arbitrary data', async () => {
  const h = harness(); await h.app.trackEvent('private@example.com', { value: 1 });
  assert.deepEqual(h.calls, []);
});
test('checkout alone never records a purchase, and repeated confirmed payments are deduplicated', async () => {
  const h = harness(), ref = 'MOBILE-12345678-1234-1234-1234-123456789abc';
  await h.app.recordAnalyticsCheckout(ref, 'event_registration', 367.5);
  assert.equal(h.calls.filter(row => row[1] === 'purchase').length, 0);
  await Promise.all([h.app.trackConfirmedPurchase(ref, 'event_registration'), h.app.trackConfirmedPurchase(ref, 'event_registration')]);
  const purchases = h.calls.filter(row => row[1] === 'purchase');
  assert.equal(purchases.length, 1);
  assert.equal(purchases[0][2].currency, 'ZAR'); assert.equal(purchases[0][2].value, 367.5);
  assert.equal(purchases[0][2].items[0].quantity, 1);
  assert.match(purchases[0][2].transaction_id, /^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify([...h.storage]).includes(ref));
  assert.ok(!JSON.stringify(h.calls).includes(ref));
});
test('confirmed purchase deduplication survives app restarts', async () => {
  const first = harness(), ref = 'LICENCE-123456789abcdef';
  await first.app.recordAnalyticsCheckout(ref, 'licence_full', 650);
  await first.app.trackConfirmedPurchase(ref, 'licence_full');
  const second = harness({ storage: first.storage }); await second.app.trackConfirmedPurchase(ref, 'licence_full');
  assert.equal(second.calls.filter(row => row[1] === 'purchase' || row[1] === 'payment_confirmed').length, 0);
});
test('older checkouts without a recorded amount never invent revenue', async () => {
  const h = harness(); await h.app.trackConfirmedPurchase('LEGACY-123456789', 'entry_balance');
  assert.equal(h.calls.filter(row => row[1] === 'purchase').length, 0);
  assert.equal(h.calls.filter(row => row[1] === 'payment_confirmed').length, 1);
});
test('corrupt transaction storage is recovered and invalid checkout inputs are ignored', async () => {
  const h = harness({ storage: new Map([['4m:analytics:transactions:v1', '{broken']]) });
  await h.app.recordAnalyticsCheckout('VALID-123456789', 'licence_temporary', 100);
  await h.app.recordAnalyticsCheckout('invalid email@example.com', 'licence_full', 100);
  await h.app.recordAnalyticsCheckout('VALID-123456780', 'licence_full', -1);
  assert.equal(h.calls.filter(row => row[1] === 'begin_checkout').length, 1);
});
test('account removal resets the SDK identity and local transaction ledger', async () => {
  const h = harness(); await h.app.recordAnalyticsCheckout('PAYMENT-123456789', 'entry_balance', 50);
  await h.app.clearAccountAnalytics();
  assert.ok(h.calls.some(row => row[0] === 'reset')); assert.equal(h.storage.size, 0);
});
