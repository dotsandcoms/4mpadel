const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const flush = () => new Promise(resolve => setImmediate(resolve));
const plain = value => JSON.parse(JSON.stringify(value));
function load(file, modules) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { module: mod, exports: mod.exports, require: name => modules[name], console });
  return mod.exports;
}
const follower = (id = '11') => ({ id, name: 'Test Player', imageUrl: null, homeClub: 'Test club' });
const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'Fragment' };

test('the follower RPC returns only the public player fields used by the list', async () => {
  const calls = [];
  const api = load('src/lib/player-followers.ts', { './supabase': { supabase: { rpc: async (...args) => {
    calls.push(plain(args));
    return { data: { followers: [{ id: '11', name: ' Test Player ', image_url: 'https://example.test/photo.jpg', home_club: 'Club', email: 'private@example.test', user_id: 'private' }], total: 2, has_more: false }, error: null };
  } } } });
  const page = await api.fetchPlayerFollowers('407', 50);
  assert.deepEqual(calls, [['get_my_player_followers', { p_player_id: '407', p_limit: 50, p_offset: 50 }]]);
  assert.deepEqual(plain(page), { followers: [{ id: '11', name: 'Test Player', imageUrl: 'https://example.test/photo.jpg', homeClub: 'Club' }], total: 2, hasMore: false });
});
test('bad IDs, pages, denied reads and malformed responses never become an empty success', async () => {
  let response = { data: {}, error: null };
  const api = load('src/lib/player-followers.ts', { './supabase': { supabase: { rpc: async () => response } } });
  await assert.rejects(api.fetchPlayerFollowers('invalid'), /Invalid player/);
  await assert.rejects(api.fetchPlayerFollowers('407', -1), /Invalid follower/);
  for (const data of [null, {}, { followers: [], total: -1, has_more: false }, { followers: [{ id: 'bad', name: 'Player' }], total: 1, has_more: false }]) {
    response = { data, error: null }; await assert.rejects(api.fetchPlayerFollowers('407'), /unavailable/);
  }
  response = { data: null, error: new Error('Access denied') };
  await assert.rejects(api.fetchPlayerFollowers('407'), /Access denied/);
});

function hookHarness() {
  const values = [], requests = []; let cursor = 0, focus, cleanup, callback, started = false;
  let session = { user: { id: 'owner' } };
  const api = load('src/hooks/use-player-followers.ts', {
    react: {
      useState(initial) { const i = cursor++; if (!(i in values)) values[i] = typeof initial === 'function' ? initial() : initial; return [values[i], next => { values[i] = typeof next === 'function' ? next(values[i]) : next; }]; },
      useRef(initial) { const i = cursor++; if (!(i in values)) values[i] = { current: initial }; return values[i]; }, useCallback: fn => fn,
    },
    'expo-router': { useFocusEffect(fn) { focus = fn; if (!started) { started = true; cleanup = fn(); } } },
    '@/lib/player-followers': { fetchPlayerFollowers: (id, offset) => new Promise((resolve, reject) => requests.push({ id, offset, resolve, reject })) },
    '@/lib/supabase': { supabase: { auth: {
      getSession: async () => ({ data: { session }, error: null }),
      onAuthStateChange(fn) { callback = fn; return { data: { subscription: { unsubscribe() {} } } }; },
    } } },
  });
  return { requests,
    render() { cursor = 0; return api.usePlayerFollowers('407'); },
    refocus() { cleanup?.(); cleanup = focus(); },
    auth(id) { session = id ? { user: { id } } : null; callback(id ? 'SIGNED_IN' : 'SIGNED_OUT', session); },
    blur() { cleanup?.(); },
  };
}
test('pagination loads once, deduplicates rows and retains the first page when a later read fails', async () => {
  const h = hookHarness(); h.render(); await flush();
  h.requests[0].resolve({ followers: [follower('11')], total: 3, hasMore: true }); await flush();
  h.render().loadMore(); h.render().loadMore(); await flush();
  assert.equal(h.requests.length, 2); assert.equal(h.requests[1].offset, 1);
  h.requests[1].reject(new Error('offline')); await flush();
  assert.equal(h.render().followers.length, 1); assert.match(h.render().moreError, /try again/);
  h.render().loadMore(); await flush();
  h.requests[2].resolve({ followers: [follower('11'), follower('12')], total: 3, hasMore: false }); await flush();
  assert.deepEqual(Array.from(h.render().followers, row => row.id), ['11', '12']);
});
test('refresh replaces the list, ignores a superseded request and updates the total', async () => {
  const h = hookHarness(); h.render(); await flush(); h.render().refresh(); await flush();
  h.requests[1].resolve({ followers: [follower('12')], total: 1, hasMore: false }); await flush();
  h.requests[0].resolve({ followers: [follower('11')], total: 99, hasMore: true }); await flush();
  assert.equal(h.render().total, 1); assert.equal(h.render().followers[0].id, '12');
  h.refocus(); await flush(); assert.equal(h.render().followers.length, 0);
});
test('sign-out immediately clears names and a late response cannot restore them', async () => {
  const h = hookHarness(); h.render(); await flush(); h.auth(null);
  assert.equal(h.render().signInRequired, true);
  h.requests[0].resolve({ followers: [follower()], total: 1, hasMore: false }); await flush();
  assert.equal(h.render().followers.length, 0); assert.equal(h.render().signInRequired, true);
});
test('switching accounts clears old names and reloads without mixing responses', async () => {
  const h = hookHarness(); h.render(); await flush(); h.auth('other'); await flush();
  h.requests[0].resolve({ followers: [follower()], total: 1, hasMore: false });
  h.requests[1].reject(new Error('Not your profile')); await flush();
  assert.equal(h.render().followers.length, 0); assert.match(h.render().error, /try again/);
});

test('tapping a follower row opens that player profile with a photo or initials fallback', () => {
  const navigations = [], state = { followers: [follower()], total: 1, hasMore: false, refresh() {}, loadMore() {} };
  const screen = load('src/app/followers.tsx', {
    'react/jsx-runtime': jsx,
    'react-native': Object.fromEntries(['View', 'Text', 'Pressable', 'FlatList', 'RefreshControl', 'ActivityIndicator'].map(name => [name, name])),
    '@expo/vector-icons': { Ionicons: 'Ionicons' }, 'expo-image': { Image: 'Image' },
    'expo-router': { Stack: { Screen: 'Stack.Screen' }, useLocalSearchParams: () => ({ playerId: '407' }), useRouter: () => ({ push: route => navigations.push(plain(route)) }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    '@/hooks/use-player-followers': { usePlayerFollowers: () => state }, '@/theme/tokens': { lightBrand: {} },
  });
  const tree = screen.default(), list = tree.props.children.find(child => child.type === 'FlatList');
  const row = list.props.renderItem({ item: follower() });
  const button = screen.FollowerRow(row.props); button.props.onPress();
  assert.equal(button.props.accessibilityLabel, "View Test Player's player profile");
  assert.deepEqual(navigations, [{ pathname: '/players/[id]', params: { id: '11' } }]);
  assert.equal(button.props.children.props.children[0].props.children.type, 'Text');
  const photo = screen.FollowerRow({ follower: { ...follower(), imageUrl: 'https://example.test/photo.jpg' }, onPress() {} });
  assert.equal(photo.props.children.props.children[0].props.children.type, 'Image');
});
