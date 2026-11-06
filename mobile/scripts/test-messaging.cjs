const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, dependencies = {}, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { module, exports: module.exports, require: id => dependencies[id] || {}, Date, Map, Set, Promise, URL, console, setTimeout, clearTimeout, ...globals });
  return module.exports;
}
const cid = '12345678-1234-1234-1234-123456789012';
function api(result = { data: {}, error: null }) {
  const calls = [];
  const module = load('src/lib/messaging.ts', { './supabase': { supabase: { rpc: async (...args) => { calls.push(args); return result; } } }, 'expo-crypto': { randomUUID: () => cid } });
  return { ...module, calls };
}
test('message validation rejects blank/oversized input and preserves Unicode', () => {
  const m = api();
  assert.equal(m.messageText('  Hello 👋  '), 'Hello 👋');
  assert.throws(() => m.messageText('   '));
  assert.throws(() => m.messageText('a'.repeat(301), true));
  assert.equal(Array.from(m.messageText('🎾'.repeat(4000))).length, 4000);
  assert.throws(() => m.messageText('a'.repeat(4001)));
});
test('messages use the authenticated RPC and never include a sender or email', async () => {
  const m = api({ data: { id: cid }, error: null });
  await m.sendMessage(cid, ' hello ', cid);
  const [name, data] = m.calls[0];
  assert.equal(name, 'messaging_api'); assert.equal(data.p_action, 'send');
  assert.equal(data.p_data.body, 'hello'); assert.equal(data.p_data.clientId, cid);
  assert.equal(data.p_data.senderId, undefined); assert.equal(data.p_data.email, undefined);
  assert.throws(() => m.sendMessage('unknown-id', 'body', cid)); assert.equal(m.calls.length, 1);
});
test('arbitrary database errors never expose SQL or player information in UI', async () => {
  const m = api({ data: null, error: { code: '23505', message: 'Key (email)=(secret@example.test) already exists; SELECT private.message' } });
  await assert.rejects(m.messaging('send'), error => !error.message.includes('secret') && !error.message.includes('SELECT'));
  const denied = m.messagingFailure({ code: '42501', message: 'This conversation is unavailable.' });
  assert.equal(denied.denied, true);
  assert.equal(denied.message, 'This conversation is unavailable.');
});
test('an undeployed backend has a useful, disabled status', async () => {
  const m = api({ data: null, error: { code: 'PGRST202', message: 'RPC not found' } });
  assert.equal((await m.messagingStatus()).enabled, false);
});
test('chat avatars reject trackers, signed URLs, credentials and other storage origins', () => {
  const m = api(), origin = 'https://fourm.supabase.co';
  assert.equal(m.messagingImageUrl(origin + '/storage/v1/object/public/profile-pics/1/avatar.jpg?t=123', origin), origin + '/storage/v1/object/public/profile-pics/1/avatar.jpg');
  for (const url of ['https://tracker.example/pixel.png', 'https://other.supabase.co/storage/v1/object/public/profile-pics/a.png', origin + '/storage/v1/object/sign/private/a.png?token=secret', 'https://user:password@fourm.supabase.co/storage/v1/object/public/profile-pics/a.png', 'file:///private/data.png']) assert.equal(m.messagingImageUrl(url, origin), null);
});
test('unread badge counts conversations and excludes requests and archives', () => {
  const m = api();
  assert.equal(m.unreadConversations([{ state: 'accepted', unread: 5 }, { state: 'accepted', unread: 1, archived: true }, { state: 'pending', unread: 1 }, { state: 'accepted', unread: 2 }]), 2);
});
test('history merging deduplicates retries, replaces edited records and remains bounded', () => {
  const m = api();
  const rows = Array.from({ length: 310 }, (_, index) => ({ id: String(index), seq: index, body: 'old' }));
  const result = m.mergeMessages(rows, [{ id: '309', seq: 309, body: '' }]);
  assert.equal(result.length, 300); assert.equal(result.at(-1).body, ''); assert.equal(result[0].seq, 10);
});
function workerFixture(context, jobs = [{ id: 'job', lease: 'lease', ticket: null, attempts: 1 }]) {
  const calls = [], sent = []; let batches = [jobs];
  const worker = load('supabase/functions/deliver-push/messaging.ts');
  const client = { rpc: async (name, args) => {
    calls.push({ name, ...args });
    const batch = name === 'messaging_push_batch' ? batches.shift() || [] : [];
    return { data: name === 'messaging_push_batch' ? { claimed: batch.length, jobs: batch.map(job => ({ ...job, context })) } : {}, error: null };
  } };
  const expo = async (endpoint, body) => { sent.push({ endpoint, body }); return body.map(() => ({ status: 'ok', id: 'ticket' })); };
  return { ...worker, client, expo, calls, sent, setBatches: rows => { batches = rows; } };
}
test('event push includes its title, generic copy, numeric badge and exact chat route', async () => {
  const w = workerFixture({ token: 'test-token', title: '4M Open', body: 'New event announcement', path: `/messages/${cid}`, badge: 4 });
  await w.deliverMessagingPush(w.client, w.expo);
  const payload = w.sent[0].body[0];
  assert.equal(payload.title, '4M Open'); assert.equal(payload.body, 'New event announcement');
  assert.equal(payload.badge, 4); assert.equal(payload.data.path, `/messages/${cid}`);
  assert.deepEqual(Object.keys(payload.data).sort(), ['path', 'type']);
  assert.equal(w.calls.at(-1).p_items[0].state, 'accepted');
});
test('revoked, muted or expired worker context prevents a push', async () => {
  const w = workerFixture({ skip: true }); await w.deliverMessagingPush(w.client, w.expo);
  assert.equal(w.sent.length, 0);
});
test('transient delivery retries retain the durable job and stop after bounded attempts', async () => {
  const w = workerFixture({ token: 'test-token', title: '4M Open', body: 'New event announcement', path: `/messages/${cid}` });
  await w.deliverMessagingPush(w.client, async () => { throw new Error('Network unavailable'); });
  assert.equal(w.calls.at(-1).p_items[0].state, 'pending');
  const exhausted = workerFixture({}, [{ id: 'job', lease: 'lease', ticket: 'ticket', attempts: 12 }]);
  await exhausted.deliverMessagingPush(exhausted.client, async () => ({}));
  assert.equal(exhausted.calls.at(-1).p_items[0].state, 'failed');
});
test('large fanout drains beyond 50 jobs using bounded send arrays and batch DB calls', async () => {
  const w = workerFixture({ token: 'test-token', title: '4M Open', body: 'New event announcement', path: `/messages/${cid}`, badge: 0 });
  const jobs = Array.from({ length: 450 }, (_, id) => ({ id: String(id), lease: `lease-${id}`, ticket: null, attempts: 1 }));
  w.setBatches([jobs.slice(0,200), jobs.slice(200,400), jobs.slice(400)]);
  assert.equal(await w.deliverMessagingPush(w.client, w.expo), 450);
  assert.equal(w.sent.length, 5); assert.ok(w.sent.every(call => call.body.length <= 100));
  assert.equal(w.calls.length, 6); assert.equal(w.calls.filter(call => call.name === 'messaging_push_finish').length, 3);
  assert.equal(w.calls.flatMap(call => call.p_items || []).length, 450);
  for (const item of w.calls.flatMap(call => call.p_items || [])) assert.equal(item.lease, `lease-${item.id}`);
});
test('private schema table contracts are reviewed and no public message table is exposed', async () => {
  const { privateMessagingContracts } = await import('../../tests/fixtures/data-api-access.mjs');
  const sql = fs.readdirSync('supabase/migrations').filter(name => /messaging|app_icon_badges/.test(name)).map(name => fs.readFileSync(`supabase/migrations/${name}`, 'utf8')).join('\n');
  const names = [...sql.matchAll(/create table (messaging\.\w+)/g)].map(match => match[1]).sort();
  assert.deepEqual(names, [...privateMessagingContracts.keys()].sort());
  assert.doesNotMatch(sql, /create table public\./i);
  for (const contract of privateMessagingContracts.values()) {
    assert.equal(contract.authenticated.length, 0); assert.equal(contract.anon.length, 0);
    assert.deepEqual(contract.service_role, ['delete', 'insert', 'select', 'update']);
  }
});
function draftsFixture(platform = 'ios') {
  const secured = new Map(), texts = new Map(); const calls = [];
  const module = load('src/lib/messaging-drafts.ts', {
    'react-native': { Platform: { OS: platform } },
    'expo-secure-store': { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1, getItemAsync: async key => secured.get(key) || null,
      setItemAsync: async (key, text) => { secured.set(key, text); }, deleteItemAsync: async key => secured.delete(key) },
    './messaging': { conversationId: id => id },
    './profile-draft-storage': { saveDraftText: async (key, value) => { calls.push('write'); texts.set(key, value); },
      loadDraftText: async key => texts.get(key) || null, clearDraftText: async key => { calls.push('delete'); texts.delete(key); } },
  });
  return { ...module, secured, texts, calls };
}
test('encrypted drafts are account-scoped, expire and are erased on sign-out', async () => {
  const d = draftsFixture(); d.activateMessageDrafts('alice'); d.activateMessageDrafts('bob');
  await d.saveMessageDraft('alice', cid, 'Private draft');
  assert.equal(await d.loadMessageDraft('alice', cid), 'Private draft');
  assert.equal(await d.loadMessageDraft('bob', cid), '');
  await d.clearMessageDrafts('alice');
  assert.equal(d.texts.size, 0); assert.equal(await d.loadMessageDraft('alice', cid), '');
  await d.saveMessageDraft('alice', cid, 'late write after logout'); assert.equal(d.texts.size, 0);
  d.activateMessageDrafts('bob'); await d.saveMessageDraft('bob', cid, 'expires');
  const key = [...d.texts.keys()][0]; d.texts.set(key, JSON.stringify({ text: 'expired', expires: 1 }));
  assert.equal(await d.loadMessageDraft('bob', cid), ''); assert.equal(d.texts.size, 0);
});
test('web drafts never fall back to unencrypted browser storage', async () => {
  const d = draftsFixture('web'); await d.saveMessageDraft('alice', cid, 'sensitive');
  assert.equal(await d.loadMessageDraft('alice', cid), ''); assert.equal(d.calls.length, 0);
});

test('unread totals count messages, including requests, and exclude archived chats', () => {
  const m = api();
  assert.equal(m.unreadMessages([{ state: 'accepted', unread: 5 }, { state: 'accepted', unread: 4, archived: true }, { state: 'pending', incoming: true, unread: 1 }, { state: 'pending', incoming: false, unread: 2 }]), 6);
  assert.equal(m.unreadMessages([]), 0);
});
test('incoming markers avoid repeated banners for the same message or for mute/read changes', () => {
  const m = api(), row = { id: cid, unread: 2, lastMessageId: 'first' };
  assert.equal(m.incomingChange([row], [{ ...row, unread: 3, lastMessageId: 'second' }]).lastMessageId, 'second');
  for (const change of [{ unread: 5 }, { lastMessageMine: true, lastMessageId: 'mine' }, { muted: true, lastMessageId: 'other' }, { archived: true, lastMessageId: 'other' }, { unread: 0, lastMessageId: 'other' }]) assert.equal(m.incomingChange([row], [{ ...row, ...change }]), undefined);
});
test('badge writes clear zero and ignore results from a previous signed-in account', async () => {
  const { createBadgeWriter, validBadgeTotal } = load('src/lib/app-icon-badge.ts');
  const writes = [], writer = createBadgeWriter(async count => writes.push(count));
  writer.switchOwner('alice'); const alice = writer.ticket(); await writer.apply(alice, 4);
  writer.switchOwner('bob'); const bob = writer.ticket(); await writer.apply(alice, 99); await writer.apply(bob, 0);
  writer.switchOwner(null); await writer.apply(bob, 7); await Promise.resolve(); await Promise.resolve();
  assert.equal(writes.at(-1), 0); assert.ok(!writes.includes(99)); assert.ok(!writes.includes(7));
  assert.equal(validBadgeTotal({ unread: 2, pending: 3, total: 5 }), 5);
  for (const value of [{ unread: 2, pending: 3, total: 1 }, { unread: -1, pending: 3, total: 2 }, { unread: 0, pending: 0, total: '0' }]) assert.equal(validBadgeTotal(value), null);
});
test('notification navigation permits only an exact conversation UUID route', () => {
  const catalog = load('src/lib/notification-events.ts');
  const { pathFromNotificationData } = load('src/lib/notification-routing.ts', { './notification-events': catalog });
  assert.equal(pathFromNotificationData({ path: `/messages/${cid}` }), `/messages/${cid}`);
  for (const path of [`/messages/${cid}?email=other`, `/messages/${cid}/../settings`, '/messages/not-a-uuid', 'https://evil.test/messages/'+cid]) assert.equal(pathFromNotificationData({ path }), null);
});

test('pending badge counts the same missing-profile and own/partner payment actions', () => {
  const balance = load('supabase/functions/native-entry-balance/balance.ts');
  const { pendingBadgeCount } = load('supabase/functions/_shared/app-badge.ts', { '../native-entry-balance/balance.ts': balance });
  const player = { email: 'alice@test.test', region: '', racket_brand: '' };
  const now = new Date('2026-11-05T10:00:00Z');
  const events = [{ id: 1, start_date: '2026-12-01' }, { id: 2, start_date: '2026-01-01' }];
  const regs = [{ id: 'one', event_id: 1, email: player.email, payment_status: 'pending' }, { id: 'two', event_id: 1, email: 'partner@test.test', partner_payment_status: 'unpaid' }, { id: 'past', event_id: 2, email: player.email, payment_status: 'pending' }];
  assert.equal(pendingBadgeCount(player, regs, events, [], [], now), 4);
  assert.equal(pendingBadgeCount({ ...player, region: 'Gauteng', racket_brand: 'Other' }, [], [], [], [], now), 0);
});
test('paid entry adjustments remain pending, while expired early-bird offers create no debt', () => {
  const balance = load('supabase/functions/native-entry-balance/balance.ts');
  const { pendingBadgeCount } = load('supabase/functions/_shared/app-badge.ts', { '../native-entry-balance/balance.ts': balance });
  const player = { email: 'alice@test.test', region: 'Gauteng', racket_brand: 'Other' };
  const reg = { id: 'entry', event_id: 1, email: player.email, payment_status: 'paid', division: 'Gold' };
  const payment = { event_id: 1, status: 'success', metadata: { covers: [{ type: 'entry', email: player.email, division: 'Gold' }], division_entry_fees: { Gold: 200 } } };
  const event = { id: 1, start_date: '2026-01-01', entry_fee: 300 };
  assert.equal(pendingBadgeCount(player, [reg], [event], [], [payment]), 1);
  assert.equal(pendingBadgeCount(player, [reg], [{ ...event, early_bird_fee: 200, early_bird_ends_at: '2026-01-01' }], [], [payment]), 0);
});

test('event role labels use only recognized server roles and tolerate older messages', () => {
  const m = api(); assert.equal(m.eventRoleLabel('admin'), 'Admin'); assert.equal(m.eventRoleLabel('organiser'), 'Organiser'); assert.equal(m.eventRoleLabel('player'), 'Player');
  for (const role of [null, undefined, 'super_admin', '<script>', {}]) assert.equal(m.eventRoleLabel(role), 'Participant');
});

function privateScreenFixture({ dev = false, os = 'ios', device = true, enabled = '1' } = {}) {
  const calls = [], states = []; let cleanup, onState;
  const AppState = { currentState: 'active', addEventListener: (_event, listener) => { onState = listener; return { remove() {} }; } };
  const capture = Object.fromEntries(['preventScreenCaptureAsync', 'enableAppSwitcherProtectionAsync', 'allowScreenCaptureAsync', 'disableAppSwitcherProtectionAsync'].map(name => [name, async () => { calls.push(name); }]));
  const hook = load('src/hooks/use-private-messaging-screen.ts', {
    react: { useCallback: fn => fn, useRef: value => ({ current: value }), useState: initial => [initial, value => states.push(value)] },
    'expo-router': { useFocusEffect: fn => { cleanup = fn(); } },
    'react-native': { Platform: { OS: os }, AppState, Alert: { alert() {} } },
    'expo-device': { isDevice: device }, 'expo-screen-capture': capture,
  }, { __DEV__: dev, process: { env: { EXPO_PUBLIC_ALLOW_SIMULATOR_SCREENSHOTS: enabled } } });
  hook.usePrivateMessagingScreen();
  return { calls, states, stop: () => cleanup(), background: () => { AppState.currentState = 'background'; onState(); } };
}
const flushPrivateScreen = () => new Promise(resolve => setImmediate(resolve));
test('screenshot exception requires explicit opt-in, Debug, iOS and an actual simulator', async () => {
  for (const options of [{}, { dev: false, device: false }, { dev: true, device: true }, { dev: true, device: false, enabled: '' }, { dev: true, device: false, enabled: '0' }, { dev: true, device: false, os: 'android' }]) {
    const fixture = privateScreenFixture(options); await flushPrivateScreen();
    assert.ok(fixture.calls.includes('preventScreenCaptureAsync'), JSON.stringify(options));
    fixture.stop(); await flushPrivateScreen();
    assert.ok(fixture.calls.includes('allowScreenCaptureAsync'));
  }
});
test('opted-in Debug simulator supports screenshots while still hiding inactive message screens', async () => {
  const fixture = privateScreenFixture({ dev: true, device: false }); await flushPrivateScreen();
  assert.deepEqual(fixture.calls, []); assert.equal(fixture.states.at(-1), true);
  fixture.background(); assert.equal(fixture.states.at(-1), false);
  fixture.stop(); await flushPrivateScreen(); assert.deepEqual(fixture.calls, []);
});

test('foreground reply marker survives an unrelated newer post and respects off settings', () => {
  const m = api(), base = { id: cid, unread: 2, lastMessageId: 'old', lastMessageSeq: 10, notificationMessageId: null };
  const reply = { ...base, lastMessageId: 'general', lastMessageSeq: 12, notificationMessageId: 'reply', notificationSeq: 11, notificationIsReply: true };
  assert.equal(m.incomingChange([base], [reply]), reply);
  assert.equal(m.incomingChange([base], [{ ...reply, notificationMessageId: null }]), undefined);
  assert.equal(m.incomingChange([{ ...base, lastMessageSeq: 12 }], [reply]), undefined);
  assert.equal(m.incomingChange([base], [{ ...reply, muted: true }]), undefined);
  assert.equal(m.incomingChange([base], [{ ...reply, unread: 0 }]), undefined);
});

test('native Messages badge clears at zero using the installed Expo tab option converter', () => {
  const React = require('react');
  const Badge = () => null, Label = () => null, Icon = () => null;
  const Trigger = Object.assign(() => null, { Badge, Label, Icon });
  const NativeTabs = Object.assign(() => null, { Trigger });
  const converter = load('node_modules/expo-router/build/native-tabs/NativeTabTrigger.js', {
    react: React, 'react-native': { StyleSheet: { flatten: value => value } },
    './common/elements': { NativeTabsTriggerBadge: Badge, NativeTabsTriggerLabel: Label, NativeTabsTriggerIcon: Icon },
    '../utils/children': { filterAllowedChildrenElements: (children, allowed) => React.Children.toArray(children).filter(child => allowed.includes(child.type)), isChildOfType: (child, type) => child.type === type },
    './utils/optionsIconConverter': { appendIconOptions() {} },
  });
  for (const [badge, expected] of [[5, '5'], [0, undefined], [101, '99+'], [0, undefined]]) {
    const layout = load('src/app/(tabs)/_layout.tsx', {
      'react/jsx-runtime': require('react/jsx-runtime'),
      '@/components/messaging/messaging-provider': { useMessagingInbox: () => ({ badge }) },
      'expo-router/unstable-native-tabs': { NativeTabs }, 'react-native': { Platform: { OS: 'ios' } },
      '@/components/app-drawer': { AppDrawer: () => null }, '@/theme/tokens': { lightBrand: {} },
    });
    const tree = layout.default(), messages = React.Children.toArray(tree.props.children.props.children).find(child => child.props.name === 'messages');
    assert.ok(messages, 'Messages tab remains available at zero');
    assert.equal(converter.convertTabPropsToOptions(messages.props).badgeValue, expected);
  }
});

test('error banners stay visible, dismiss independently, retry identical errors and hide off-screen', () => {
  const values = [], dependencies = [], announcements = [];
  let stateIndex = 0, effectIndex = 0, changed = false, focus, blur, onAppState;
  const native = { currentState: 'active', addEventListener: (_event, listener) => { onAppState = listener; return { remove() {} }; } };
  const component = load('src/components/error-banner.tsx', {
    react: {
      useState: initial => { const index = stateIndex++; if (!(index in values)) values[index] = initial; return [values[index], value => { const next = typeof value === 'function' ? value(values[index]) : value; if (next !== values[index]) { values[index] = next; changed = true; } }]; },
      useCallback: fn => fn,
      useEffect: (fn, deps) => { const index = effectIndex++, previous = dependencies[index]; if (!previous || deps.some((value, n) => !Object.is(value, previous[n]))) { dependencies[index] = deps; fn(); } },
    },
    'react/jsx-runtime': require('react/jsx-runtime'),
    './error-banner-presentation': { ErrorPresentation: 'NativeErrorPresentation' },
    'expo-router': { useFocusEffect: fn => { if (!focus) { focus = () => { blur = fn(); }; focus(); } } },
    'react-native': { AppState: native, Platform: { OS: 'ios' }, AccessibilityInfo: { announceForAccessibility: message => announcements.push(message) }, View: 'View', Text: 'Text', Pressable: 'Pressable' },
    '@expo/vector-icons': { Ionicons: 'Icon' }, '@/theme/tokens': { lightBrand: { danger: '#B7352D' } },
  });
  function render(message) { let tree, loops = 0; do { changed = false; stateIndex = 0; effectIndex = 0; tree = component.ErrorBanner({ message }); assert.ok(++loops < 8); } while (changed); return tree; }
  const error = 'Messaging is unavailable for this player.';
  const tree = render(error);
  assert.ok(tree); assert.equal(announcements.at(-1), error);
  tree.props.onDismiss(); assert.equal(render(error), null);
  render(null); assert.ok(render(error), 'the same failure after a retry is shown again');
  native.currentState = 'background'; onAppState('background'); assert.equal(render(error), null);
  native.currentState = 'active'; onAppState('active'); assert.ok(render(error));
  blur(); assert.equal(render(error), null, 'a previous route cannot overlay the current screen');
  focus(); assert.ok(render(error));
});

test('Android native snackbar dismissal and fallback cannot affect a disposed screen', async () => {
  let cleanup, complete, fail, dismissed = 0;
  const shown = [], toasts = [];
  const snackbar = { showSnackbar: options => { shown.push(options); return new Promise((resolve, reject) => { complete = resolve; fail = reject; }); } };
  const component = load('src/components/error-banner-presentation.android.tsx', {
    react: { useRef: () => ({ current: snackbar }), useEffect: fn => { cleanup = fn(); } },
    'react/jsx-runtime': require('react/jsx-runtime'),
    '@expo/ui/jetpack-compose': { Host: 'ComposeHost', SnackbarHost: 'MaterialSnackbarHost' },
    './swipe-dismissible-banner': { SwipeDismissibleBanner: 'SwipeDismissibleBanner' },
    '@expo/ui/jetpack-compose/modifiers': { fillMaxWidth: () => ({}) },
    'react-native': { ToastAndroid: { LONG: 1, show: message => toasts.push(message) } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 24 }) },
  });
  const props = { message: 'Could not send. Try again.', onDismiss: () => dismissed++ };
  const tree = component.ErrorPresentation(props);
  assert.equal(tree.props.bottom, 36);
  assert.equal(shown[0].duration, 'indefinite'); assert.equal(shown[0].withDismissAction, true);
  cleanup(); complete('dismissed'); await Promise.resolve(); assert.equal(dismissed, 0);
  component.ErrorPresentation(props); complete('dismissed'); await Promise.resolve(); assert.equal(dismissed, 1);
  component.ErrorPresentation(props); cleanup(); fail(new Error('disposed native host')); await Promise.resolve(); await Promise.resolve(); assert.equal(toasts.length, 0);
  component.ErrorPresentation(props); fail(new Error('host unavailable')); await Promise.resolve(); await Promise.resolve(); assert.deepEqual(toasts, [props.message]);
});

test('banner swipes require a deliberate distance or directional flick', () => {
  const { bannerSwipeCompletes: dismiss } = load('src/lib/banner-swipe.ts');
  for (const [distance, speed] of [[0, -1200], [-5, -1000], [-20, 1000], [80, -1000]]) assert.equal(dismiss('up', distance, speed), false);
  assert.equal(dismiss('up', -40, 0), true); assert.equal(dismiss('up', -20, -700), true);
  for (const [distance, speed] of [[0, 1400], [10, 1400], [25, -1000], [-25, 1000]]) assert.equal(dismiss('horizontal', distance, speed), false);
  assert.equal(dismiss('horizontal', 80, 0), true); assert.equal(dismiss('horizontal', -80, 0), true);
  assert.equal(dismiss('horizontal', 25, 900), true); assert.equal(dismiss('horizontal', -25, -900), true);
});
