const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');

global.IS_REACT_ACT_ENVIRONMENT = true;

const source = fs.readFileSync('src/lib/coaches.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const coachId = '56d90119-e850-4310-93ee-77d11d1e71e4';

function fixture(data, error = null) {
  const calls = [];
  const query = { then: resolve => resolve({ data, error }) };
  for (const method of ['from', 'select', 'eq', 'order', 'abortSignal', 'maybeSingle', 'rpc']) {
    query[method] = (...args) => { calls.push([method, ...args]); return query; };
  }
  const api = {};
  vm.runInNewContext(compiled, { exports: api, URL, require: () => ({ supabase: query }) });
  return { api, calls };
}

test('the coach directory requests only approved rows and omits contact details', async () => {
  const { api, calls } = fixture([{ id: coachId }]);
  const { signal } = new AbortController();
  assert.deepEqual(await api.fetchApprovedCoaches(signal), [{ id: coachId }]);
  assert.deepEqual(calls, [
    ['from', 'coach_applications'], ['select', 'id,full_name,city,coaching_location,profile_pic_url'],
    ['eq', 'status', 'approved'], ['order', 'full_name'], ['order', 'id'], ['abortSignal', signal],
  ]);
});

test('coach deep links reject malformed IDs and still require approval for valid IDs', async () => {
  const { api, calls } = fixture(null);
  const { signal } = new AbortController();
  assert.equal(await api.fetchCoachProfile('unknown', signal), null);
  assert.deepEqual(calls, []);
  assert.equal(await api.fetchCoachProfile(coachId, signal), null);
  assert.deepEqual(calls.filter(([method]) => method === 'eq'), [['eq', 'status', 'approved'], ['eq', 'id', coachId]]);
  assert.deepEqual(calls.at(-1), ['maybeSingle']);
});

test('coach contact actions accept published formats and reject unsafe schemes', () => {
  const { api } = fixture(null);
  assert.equal(api.coachEmailUrl('coach+bookings@example.com'), 'mailto:coach%2Bbookings@example.com');
  assert.equal(api.coachEmailUrl('coach@example.com\nBcc:other@example.com'), undefined);
  assert.equal(api.coachPhoneUrl('+27 (82) 555-0123'), 'tel:+27825550123');
  assert.equal(api.coachPhoneUrl('*123#'), undefined);
  assert.equal(api.coachPublicUrl('https://example.com/coach'), 'https://example.com/coach');
  assert.equal(api.coachPublicUrl('javascript:alert(1)'), undefined);
});

test('venues follow the editor separators and repeated names appear once', () => {
  const { api } = fixture(null);
  assert.deepEqual([...api.coachVenues('Net Set Sandton · 10by20 KCC / Central, 10by20 KCC')],
    ['Net Set Sandton', '10by20 KCC', 'Central']);
  assert.deepEqual([...api.coachVenues('Killarney country club 10/20 · Central')],
    ['Killarney country club 10/20', 'Central']);
  assert.deepEqual([...api.coachVenues(null)], []);
});

test('coach messaging uses the approved listing ID and works with an earlier server', async () => {
  const { api, calls } = fixture({ playerId: '42', conversationId: coachId });
  const { signal } = new AbortController();
  const target = await api.fetchCoachMessageTarget(coachId, signal);
  assert.equal(target.playerId, '42');
  assert.equal(target.conversationId, coachId);
  assert.equal(calls[0][1], 'coach_message_target');
  assert.equal(calls[0][2].p_coach_id, coachId);
  assert.equal(await fixture(null, { code: 'PGRST202' }).api.fetchCoachMessageTarget(coachId, signal), null);
  assert.equal(await fixture({ playerId: 'untrusted', conversationId: coachId }).api.fetchCoachMessageTarget(coachId, signal), null);
});

test('the coach contact row shows Message for a verified profile with messaging unavailable', async () => {
  const { api } = fixture({ unavailable: true });
  const alerts = [];
  const routes = [];
  const native = Object.fromEntries(['ActivityIndicator', 'Modal', 'Pressable', 'RefreshControl', 'ScrollView', 'Text', 'View'].map(name => [name, name]));
  native.StyleSheet = { create: styles => styles };
  native.useWindowDimensions = () => ({ width: 402, fontScale: 1 });
  native.Alert = { alert: (...args) => alerts.push(args) };
  const modules = {
    react: React,
    'react/jsx-runtime': require('react/jsx-runtime'),
    'react-native': native,
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    'expo-router': {
      Stack: { Screen: 'Screen' },
      useLocalSearchParams: () => ({ id: coachId }),
      useRouter: () => ({ push: route => routes.push(route) }),
      useFocusEffect: callback => React.useEffect(callback, [callback]),
    },
    'expo-image': { Image: 'Image' },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/components/coach-portrait': { CoachPortrait: 'CoachPortrait' },
    '@/components/messaging/messaging-provider': { useMessagingInbox: () => ({ owner: 'viewer', status: { enabled: true } }) },
    '@/lib/coaches': {
      ...api,
      fetchCoachProfile: async () => ({ id: coachId, full_name: 'Example Coach', email: 'coach@example.test' }),
    },
    '@/lib/site': {},
    '@/theme/tokens': { lightBrand: {} },
  };
  const profile = {};
  const script = ts.transpileModule(fs.readFileSync('src/app/coaches/[id].tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(script, { exports: profile, require: name => modules[name], AbortController });
  let tree;
  try {
    await act(async () => { tree = create(React.createElement(profile.default)); });
    const message = tree.root.findByProps({ accessibilityLabel: 'Message Example Coach' });
    assert.equal(message.findByType('Icon').props.name, 'chatbubble-outline');
    message.props.onPress();
    assert.equal(alerts[0][0], 'Messaging unavailable');
    assert.deepEqual(routes, []);
  } finally {
    if (tree) await act(async () => tree.unmount());
  }
});
