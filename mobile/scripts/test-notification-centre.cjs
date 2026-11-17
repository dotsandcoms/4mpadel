const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
function load(file, requireModule = () => ({})) { const mod = { exports: {} }; vm.runInNewContext(compile(file), { module: mod, exports: mod.exports, require: requireModule, Date, Map, Set, URLSearchParams }); return mod.exports; }
const paths = load('src/lib/notification-events.ts');
const routing = load('src/lib/notification-routing.ts', () => paths);
const api = load('src/lib/notification-centre.ts', () => routing);
const action = (key, eventId, extra = {}) => ({ key, eventId, kind: 'payment', title: 'Complete payment', subtitle: 'Same name', detail: 'Open', path: `/events/register?id=${eventId}&mode=pay`, ...extra });
const note = (id, eventId, extra = {}) => ({ id, type: 'event_updated', title: 'Updated', body: 'Event update', path: `/events/${eventId}?tab=Overview`, created_at: `2026-11-06T10:00:00Z`, ...extra });

test('events with identical titles remain separate by ID; actions and history for one event join', () => {
  const groups = api.groupNotifications([action('a', 1), action('b', 2)], [note('n', 1)], []);
  assert.equal(groups.length, 2);
  assert.equal(groups.find(group => group.eventId === 1).notifications.length, 1);
  assert.equal(groups.find(group => group.eventId === 2).notifications.length, 0);
});
test('event metadata supplies name, photo and date; account updates stay out of event groups', () => {
  const event = { id: 1, event_name: 'Cup', image_url: 'https://example.com/cup.jpg', start_date: '2026-11-20' };
  const groups = api.groupNotifications([action('region', undefined, { kind: 'profile' }), action('entry', 1)], [], [event]);
  assert.equal(groups.find(group => group.eventId === 1).title, 'Cup');
  assert.equal(groups.find(group => group.eventId === 1).event, event);
  assert.equal(groups.find(group => group.key === 'account').title, 'My account');
});
test('event IDs come only from validated routes, never titles or external URLs', () => {
  assert.equal(api.notificationEventId(note('n', 1)), 1);
  assert.equal(api.notificationEventId(note('n', 1, { path: 'https://evil.example/events/999' })), null);
  assert.equal(api.notificationEventId(note('n', 1, { path: '/events/1?redirect=https://evil.example' })), null);
  assert.equal(api.notificationEventId(note('n', 1, { path: '/events/99999999999999999' })), null);
  assert.deepEqual(Array.from(api.notificationEventIds([action('a', 2), action('b', 2)], [note('n', 1)])), [2, 1]);
});
test('pending actions sort first and history within an event remains newest first', () => {
  const groups = api.groupNotifications([action('a', 2)], [note('old', 1, { created_at: '2026-11-05T00:00:00Z' }), note('new', 1)], []);
  assert.equal(groups[0].eventId, 2);
  assert.deepEqual(Array.from(groups[1].notifications, row => row.id), ['new', 'old']);
});
test('missing metadata still identifies the event and unrelated payment fallbacks never merge by title', () => {
  const groups = api.groupNotifications([action('a', undefined), action('b', undefined)], [note('n', 99)], []);
  assert.equal(groups.length, 3); assert.equal(groups.find(group => group.eventId === 99).title, 'Event #99');
});
test('message links and international matches retain their own groups', () => {
  const groups = api.groupNotifications([], [note('message', 1, { path: '/messages/123e4567-e89b-42d3-a456-426614174000' }), note('international', 1, { path: '/pro/match/23' })], []);
  assert.deepEqual(Array.from(groups, group => group.key).sort(), ['international', 'messages']);
});

const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
function notificationHarness({ slowActions = false, slowMetadata = false, slowRead = false } = {}) {
  const slots = [], effects = [];
  let cursor = 0, account = 'a', receive;
  const pending = deferred(), metadata = deferred(), read = deferred();
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const hooks = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { value: initial }; return [slots[i].value, value => { slots[i].value = typeof value === 'function' ? value(slots[i].value) : value; }]; },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useCallback(fn, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) slots[i] = { fn, deps }; return slots[i].fn; },
    useEffect(fn, deps) { const i = cursor++; if (!same(slots[i]?.deps, deps)) { const previous = slots[i]; slots[i] = { deps, cleanup: previous?.cleanup }; effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = fn(); }); } },
  };
  const user = () => ({ id: account, email: `${account}@example.com` });
  const ownAction = () => [action(account, account === 'a' ? 1 : 2)];
  const modules = {
    react: hooks, 'expo-router': { useFocusEffect: callback => hooks.useEffect(callback, [callback]) },
    '@/lib/home': { fetchPendingActions: () => account === 'a' && slowActions ? pending.promise : Promise.resolve(ownAction()) },
    '@/lib/notification-centre': api,
    '@/lib/notification-read-state': {
      fetchNotificationSnapshot: async () => ({ items: [note(account, account === 'a' ? 1 : 2, { read_at: null })], unread: 1, through: '2026-11-10T10:00:00Z' }),
      markNotificationsRead: async () => slowRead ? read.promise : ({ items: [note(account, account === 'a' ? 1 : 2, { read_at: '2026-11-10T10:01:00Z' })], unread: 0, through: '2026-11-10T10:01:00Z' }),
    },
    '@/lib/supabase': { supabase: {
      auth: { getSession: async () => ({ data: { session: { user: user() } } }), onAuthStateChange(fn) { receive = fn; return { data: { subscription: { unsubscribe() {} } } }; } },
      rpc: () => Promise.resolve({ data: [note(account, account === 'a' ? 1 : 2)], error: null }),
      from: () => ({ select() { return this; }, in(_column, ids) { return account === 'a' && slowMetadata ? metadata.promise : Promise.resolve({ data: ids.map(id => ({ id, event_name: `Event ${account}` })), error: null }); } }),
    } },
  };
  const hook = load('src/hooks/use-notification-centre.ts', name => modules[name]);
  const render = () => { cursor = 0; return hook.useNotificationCentre(); };
  const flush = async () => { for (let i = 0; i < 16; i++) { render(); while (effects.length) effects.shift()(); await Promise.resolve(); } return render(); };
  return { render, flush, pending, metadata, read, switchAccount() { account = 'b'; receive('SIGNED_IN', { user: user() }); } };
}
test('notification rows are masked immediately on account switch and late history cannot restore them', async () => {
  const app = notificationHarness({ slowActions: true });
  assert.equal(app.render().actions.length, 0); await app.flush();
  app.switchAccount(); assert.equal(app.render().notifications.length, 0);
  let state = await app.flush(); assert.equal(state.actions[0].key, 'b');
  app.pending.resolve([action('a', 1)]); state = await app.flush();
  assert.equal(state.actions[0].key, 'b'); assert.equal(state.notifications[0].id, 'b');
});
test('an old event-metadata response cannot replace the next account’s event names', async () => {
  const app = notificationHarness({ slowMetadata: true }); await app.flush(); app.switchAccount();
  let state = await app.flush(); assert.equal(state.events[0].event_name, 'Event b');
  app.metadata.resolve({ data: [{ id: 1, event_name: 'Private event a' }], error: null }); state = await app.flush();
  assert.equal(state.events[0].event_name, 'Event b');
});
test('reading clears notification unread state and a previous account cannot restore it', async () => {
  const normal = notificationHarness(); let state = await normal.flush();
  assert.equal(state.unread, 1); assert.equal(await state.markRead(['a']), true);
  state = await normal.flush(); assert.equal(state.unread, 0); assert.ok(state.notifications[0].read_at);
  const slow = notificationHarness({ slowRead: true }); state = await slow.flush();
  const old = state.markRead(['a']); slow.switchAccount(); state = await slow.flush();
  slow.read.resolve({ items: [note('a', 1)], unread: 0, through: '2026-11-10T10:01:00Z' });
  assert.equal(await old, false); state = await slow.flush();
  assert.equal(state.notifications[0].id, 'b'); assert.equal(state.unread, 1);
});

test('notification reads use only owned IDs and notify badge listeners after success', async () => {
  const calls = [], data = { items: [], unread: 0, through: '2026-11-10T10:00:00Z' };
  const reads = load('src/lib/notification-read-state.ts', () => ({ supabase: { rpc: async (name, input) => { calls.push({ name, input }); return { data, error: null }; } } }));
  let changes = 0; const stop = reads.subscribeNotificationReads(() => changes++);
  const id = '70000000-0000-0000-0000-000000000001';
  await reads.markNotificationFromPush({ type: 'admin_broadcast', notificationId: id });
  assert.equal(changes, 1); assert.equal(calls[0].name, 'player_notification_api');
  assert.deepEqual(Array.from(calls[0].input.p_ids), [id]); assert.equal(calls[0].input.p_email, undefined);
  await reads.markNotificationFromPush({ type: 'chat_message', notificationId: id });
  await reads.markNotificationFromPush({ notificationId: '../other' });
  assert.equal(calls.length, 1);
  await assert.rejects(reads.markNotificationsRead(['bad']), /Choose/);
  await assert.rejects(reads.markNotificationsRead(), /Refresh/);
  stop(); await reads.markNotificationsRead([id]); assert.equal(changes, 1);
});
