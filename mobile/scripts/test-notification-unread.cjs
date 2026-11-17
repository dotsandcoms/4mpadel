const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const React = require('react'), { create, act } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
function load(file, modules) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { module: mod, exports: mod.exports, require: id => id === 'react' ? React : id === 'react/jsx-runtime' ? require(id) : modules[id] || {}, console, Promise, Set });
  return mod.exports;
}
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
test('bell refreshes after a read and ignores a late count from before the read or previous account', async () => {
  const requests = [], listeners = new Set(); let latest;
  const hook = load('src/hooks/use-notification-unread.ts', {
    'expo-router': { useFocusEffect: callback => React.useEffect(callback, [callback]) },
    'react-native': { AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) } },
    'expo-notifications': { addNotificationReceivedListener: () => ({ remove() {} }) },
    '@/lib/notification-read-state': { fetchNotificationSnapshot: () => { const d = deferred(); requests.push(d); return d.promise; }, subscribeNotificationReads: listener => { listeners.add(listener); return () => listeners.delete(listener); } },
  });
  function Screen({ owner }) { latest = hook.useNotificationUnread(owner); return null; }
  let renderer;
  try {
    await act(async () => { renderer = create(React.createElement(Screen, { owner: 'a' })); });
    await act(async () => { requests[0].resolve({ unread: 3 }); await settle(); }); assert.equal(latest, 3);
    await act(async () => { for (const listener of listeners) listener(); });
    await act(async () => { for (const listener of listeners) listener(); });
    await act(async () => { requests[2].resolve({ unread: 0 }); await settle(); }); assert.equal(latest, 0);
    await act(async () => { requests[1].resolve({ unread: 3 }); await settle(); }); assert.equal(latest, 0);
    await act(async () => { for (const listener of listeners) listener(); renderer.update(React.createElement(Screen, { owner: 'b' })); });
    assert.equal(latest, 0);
    await act(async () => { requests.at(-1).resolve({ unread: 1 }); await settle(); }); assert.equal(latest, 1);
    await act(async () => { requests[3].resolve({ unread: 9 }); await settle(); }); assert.equal(latest, 1);
    await act(async () => renderer.update(React.createElement(Screen, { owner: null }))); assert.equal(latest, 0);
  } finally { if (renderer) await act(async () => renderer.unmount()); }
});
test('expanding notification updates marks them read and queues a second group while the first is saving', async () => {
  const first = deferred(), calls = [];
  const groups = ['one','two'].map((key, i) => ({ key, title: key, eventId: null, actions: [], notifications: [{ id: String(i), title: key, body: 'Update', read_at: null }] }));
  const native = Object.fromEntries(['ActivityIndicator','Pressable','Text','View','RefreshControl'].map(name => [name,name]));
  native.StyleSheet = { create: value => value };
  native.FlatList = ({ data, renderItem, ListHeaderComponent }) => React.createElement('List', null, ListHeaderComponent, ...data.map(item => renderItem({ item })));
  const screen = load('src/app/notifications.tsx', {
    'react-native': native, 'expo-router': { useRouter: () => ({}) }, 'expo-symbols': { SymbolView: 'Symbol' },
    '@/components/help-inbox-provider': { useHelpInbox: () => ({ unread: 0 }) }, '@/theme/tokens': { lightBrand: {} },
    '@/components/home-action': { HomeAction: 'Action' }, '@/components/native-segmented-control': { NativeSegmentedControl: 'Segment' }, '@/components/error-banner': { ErrorBanner: 'Error' },
    '@/hooks/use-notification-centre': { useNotificationCentre: () => ({ ownerKey: 'a', actions: [], notifications: [], events: [], markRead: ids => { calls.push(Array.from(ids)); return calls.length === 1 ? first.promise : Promise.resolve(true); } }) },
    '@/lib/notification-centre': { groupNotifications: () => groups }, '@/lib/following-feed': { feedTime: () => 'Now' },
  });
  let renderer;
  try {
    await act(async () => { renderer = create(React.createElement(screen.default)); });
    await act(async () => renderer.root.findByType('Segment').props.onChange('all'));
    await act(async () => renderer.root.findByProps({ accessibilityLabel: 'one. 1 update. Expand' }).props.onPress());
    await act(async () => renderer.root.findByProps({ accessibilityLabel: 'two. 1 update. Expand' }).props.onPress());
    assert.deepEqual(calls, [['0']]);
    await act(async () => { first.resolve(true); await settle(); }); assert.deepEqual(calls, [['0'],['1']]);
  } finally { if (renderer) await act(async () => renderer.unmount()); }
});
