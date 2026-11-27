const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;

function load(file, dependencies = {}, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    module, exports: module.exports, require: id => id === 'react' ? React : id === 'react/jsx-runtime' ? require(id) : dependencies[id] || {},
    console, Date, Map, Set, Promise, setTimeout, clearTimeout, ...globals,
  });
  return module.exports;
}
const plain = value => JSON.parse(JSON.stringify(value));
const lib = load('src/lib/guided-tour.ts');
const { GUIDES, emptyTourProgress, parseTourProgress, tourPathMatches, visibleTourRect, tourCardPosition } = lib;
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const settle = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };

test('invalid or future preferences reset safely; stored chapter IDs are validated and deduplicated', () => {
  for (const value of [null, '{', '{}', '{"version":2,"welcome":"completed"}', '{"version":1,"welcome":"unknown"}']) {
    assert.deepEqual(plain(parseTourProgress(value)), plain(emptyTourProgress()));
  }
  const progress = parseTourProgress(JSON.stringify({ version: 1, welcome: 'later', seen: ['home', 'home', '__proto__', 'constructor', 5, 'players'], completed: ['settings', 'unknown'] }));
  assert.deepEqual(plain(progress), { version: 1, welcome: 'later', seen: ['home', 'players'], completed: ['settings'] });
});

test('route matching handles Home and trailing slashes without confusing club directories or similar routes', () => {
  assert.ok(tourPathMatches('/', '/index'));
  assert.ok(tourPathMatches('/settings', '/settings/'));
  assert.ok(tourPathMatches('/clubs/*', '/clubs/example'));
  for (const path of ['/clubs', '/clubs/', '/clubsmith/example', '/settings']) assert.equal(tourPathMatches('/clubs/*', path), false);
  assert.equal(tourPathMatches('/messages', '/messages/chat'), false);
});

test('the spotlight clips to safe bounds and rejects offscreen or invalid targets', () => {
  assert.deepEqual(plain(visibleTourRect({ x: -10, y: 30, width: 450, height: 100 }, 393, 852, 59, 34)), { x: 8, y: 63, width: 377, height: 72 });
  for (const rect of [{ x: 0, y: -200, width: 100, height: 50 }, { x: 0, y: 900, width: 100, height: 50 }, { x: NaN, y: 0, width: 50, height: 50 }, { x: 0, y: 0, width: 0, height: 0 }]) {
    assert.equal(visibleTourRect(rect, 393, 852, 59, 34), null);
  }
});

test('tooltip placement stays readable on small screens, above low controls and below high controls', () => {
  for (const width of [320, 393, 768]) for (const cardHeight of [220, 430]) for (const rect of [null, { x: 16, y: 70, width: width - 32, height: 44 }, { x: 20, y: 650, width: 80, height: 44 }]) {
    const box = tourCardPosition(rect, { width, height: 800, top: 50, bottom: 30 }, cardHeight);
    assert.ok(box.left >= 16 && box.left + box.width <= width - 16);
    assert.ok(box.top >= 62 && box.top + cardHeight <= 758);
    if (rect?.y === 70) assert.equal(box.placement, 'below');
    if (rect?.y === 650) assert.equal(box.placement, 'above');
  }
});

test('storage uses account keys, immutable snapshots and ordered writes, including after a failed write', async () => {
  const first = deferred(), writes = [];
  const storage = load('src/lib/guided-tour-storage.ts', {
    './guided-tour': lib,
    '@react-native-async-storage/async-storage': { __esModule: true, default: {
      getItem: async key => { assert.equal(key, 'fourm-guided-tour-v1:brad'); return JSON.stringify({ ...emptyTourProgress(), welcome: 'later' }); },
      setItem: (key, value) => { writes.push({ key, value }); return writes.length === 1 ? first.promise : Promise.resolve(); },
    } },
  });
  assert.equal((await storage.readTourProgress('brad')).welcome, 'later');
  const progress = emptyTourProgress(); progress.seen.push('home');
  const a = storage.saveTourProgress('brad', progress); a.catch(() => {});
  progress.seen.push('settings');
  const b = storage.saveTourProgress('other', progress);
  await settle(); assert.equal(writes.length, 1);
  assert.deepEqual(JSON.parse(writes[0].value).seen, ['home']);
  first.reject(new Error('device storage unavailable'));
  await assert.rejects(a); await b;
  assert.equal(writes[1].key, 'fourm-guided-tour-v1:other');
  assert.deepEqual(JSON.parse(writes[1].value).seen, ['home', 'settings']);
});

function fixture(options = {}) {
  const state = { owner: 'account-a', notice: null, path: '/', enabled: true, ...options };
  const timers = new Set(), writes = [], navigation = [], renders = [];
  let appListener, backListener, context, renderer;
  const ctx = load('src/components/guided-tour/context.ts');
  const native = {
    View: 'View',
    AppState: { currentState: 'active', addEventListener: (_event, handler) => { appListener = handler; return { remove() { appListener = null; } }; } },
    BackHandler: { addEventListener: (_event, handler) => { backListener = handler; return { remove() { backListener = null; } }; } },
  };
  const router = { navigate: destination => navigation.push(plain(destination)) };
  const { GuidedTourProvider } = load('src/components/guided-tour/provider.tsx', {
    'react-native': native,
    'expo-router': { usePathname: () => state.path, useRouter: () => router },
    '@/components/messaging/messaging-provider': { useMessagingInbox: () => state },
    '@/lib/guided-tour': lib,
    '@/lib/guided-tour-storage': { readTourProgress: owner => options.read ? options.read(owner) : Promise.resolve(options.progress || emptyTourProgress()), saveTourProgress: async (owner, progress) => { writes.push({ owner, progress: plain(progress) }); } },
    '@/lib/haptics': { hapticLight() {}, hapticSuccess() {} },
    './context': ctx, './spotlight': { GuidedTourOverlay: () => null },
  }, {
    setTimeout: (fn, ms) => { const timer = { fn, ms }; timers.add(timer); return timer; },
    clearTimeout: timer => timers.delete(timer),
  });
  function Observer() { context = ctx.useGuidedTour(); renders.push(context); return null; }
  const tree = () => React.createElement(GuidedTourProvider, { enabled: state.enabled }, React.createElement(Observer));
  return {
    state, writes, navigation, renders, get: () => context,
    mount: async () => { await act(async () => { renderer = create(tree()); await settle(); }); },
    render: async change => { await act(async () => { Object.assign(state, change); renderer.update(tree()); await settle(); }); },
    action: async fn => { await act(async () => { await fn(context); await settle(); }); },
    fire: async ms => { await act(async () => { for (const timer of [...timers]) if (timer.ms === ms) { timers.delete(timer); timer.fn(); } await settle(); }); },
    app: async value => { await act(async () => appListener(value)); },
    back: async () => { let result; await act(async () => { result = backListener?.(); }); return result; },
    close: async () => { if (renderer) await act(async () => renderer.unmount()); },
  };
}

test('welcome waits for loading and the Home screen, is optional and stays dismissed after a restart', async () => {
  const pending = deferred(), f = fixture({ read: () => pending.promise });
  try {
    await f.mount(); await f.fire(650);
    assert.equal(f.get().ready, false); assert.equal(f.get().welcomeVisible, false);
    await f.action(async () => pending.resolve(emptyTourProgress()));
    assert.equal(f.get().allowSystemPrompts, false);
    await f.render({ path: '/rankings' }); await f.fire(650);
    assert.equal(f.get().welcomeVisible, false);
    await f.render({ path: '/' }); await f.fire(650);
    assert.equal(f.get().welcomeVisible, true);
    assert.equal(await f.back(), true);
    assert.equal(f.get().welcomeVisible, false); assert.equal(f.get().progress.welcome, 'later');
    assert.equal(f.get().allowSystemPrompts, true);
    assert.equal(f.writes.at(-1).owner, 'account-a');
    const restart = fixture({ progress: f.writes.at(-1).progress });
    try { await restart.mount(); await restart.fire(650); assert.equal(restart.get().welcomeVisible, false); } finally { await restart.close(); }
  } finally { await f.close(); }
});

test('the six-stop introduction navigates, opens the menu, completes and can be replayed', async () => {
  const f = fixture(); let opened = 0, closed = 0;
  try {
    await f.mount();
    await f.action(tour => tour.registerMenu({ open: () => { opened++; tour.menuVisibility(true); }, close: () => { closed++; tour.menuVisibility(false); } }));
    await f.action(tour => tour.start('overview'));
    assert.equal(f.get().active.index, 0); assert.equal(f.get().visible, true); assert.equal(f.get().progress.welcome, 'started');
    for (let index = 1; index < GUIDES.overview.steps.length; index++) {
      await f.action(tour => tour.next());
      const step = GUIDES.overview.steps[index];
      await f.render({ path: step.path });
      assert.equal(f.get().active.index, index); assert.equal(f.get().visible, true);
    }
    assert.equal(opened, 1); assert.ok(closed >= 3);
    await f.action(tour => tour.next());
    assert.equal(f.get().active, null); assert.equal(f.get().progress.welcome, 'completed');
    assert.ok(f.get().progress.completed.includes('overview'));
    assert.equal(f.navigation.at(-1), '/(tabs)');
    await f.action(tour => tour.start('overview')); await f.render({ path: '/' });
    assert.equal(f.get().active.index, 0);
    await f.action(tour => tour.stop());
    assert.equal(f.get().progress.welcome, 'skipped');
    await f.fire(650); assert.equal(f.get().welcomeVisible, false);
  } finally { await f.close(); }
});

test('opening the next destination advances the introduction; unrelated navigation releases it', async () => {
  const f = fixture();
  try {
    await f.mount(); await f.action(tour => tour.start('overview'));
    await f.render({ path: '/rankings' });
    assert.equal(f.get().active.index, 1); assert.equal(f.get().visible, true);
    await f.render({ path: '/players/someone' });
    assert.equal(f.get().active, null);
    await f.render({ path: '/' }); await f.fire(650);
    assert.equal(f.get().welcomeVisible, false);
  } finally { await f.close(); }
});

test('tips pause for app background and incoming banners; Back skips without trapping the user', async () => {
  const f = fixture({ progress: { ...emptyTourProgress(), welcome: 'later' } });
  try {
    await f.mount(); await f.action(tour => tour.start('home'));
    assert.equal(f.get().visible, true);
    await f.app('background'); assert.equal(f.get().visible, false);
    await f.app('active'); assert.equal(f.get().visible, true);
    await f.render({ notice: { id: 'incoming' } }); assert.equal(f.get().visible, false);
    await f.render({ notice: null }); assert.equal(f.get().visible, true);
    assert.equal(await f.back(), true); assert.equal(f.get().active, null);
    assert.ok(f.get().progress.seen.includes('home'));
    await f.action(tour => tour.dismissTip('clubs'));
    assert.ok(f.writes.at(-1).progress.seen.includes('clubs'));
  } finally { await f.close(); }
});

test('account changes mask previous progress immediately and discard late storage responses', async () => {
  const a = deferred(), b = deferred(), f = fixture({ read: owner => owner === 'account-a' ? a.promise : b.promise });
  try {
    await f.mount();
    const before = f.renders.length;
    await f.render({ owner: 'account-b' });
    assert.ok(f.renders.slice(before).every(tour => !tour.active && tour.progress.welcome === 'unseen'));
    await f.action(async () => a.resolve({ ...emptyTourProgress(), welcome: 'completed', completed: ['overview'] }));
    assert.equal(f.get().ready, false);
    await f.action(async () => b.resolve({ ...emptyTourProgress(), welcome: 'later' }));
    assert.equal(f.get().ready, true); assert.equal(f.get().progress.welcome, 'later');
    await f.action(tour => tour.start('home'));
    assert.ok(f.writes.every(write => write.owner === 'account-b'));
    await f.render({ owner: null });
    assert.equal(f.get().active, null); assert.equal(f.get().ready, false);
    await f.action(tour => tour.start('overview'));
    assert.equal(f.get().active, null);
  } finally { await f.close(); }
});

test('disabled boot/auth screens cannot launch a tour; failed navigation and closed menus cancel cleanly', async () => {
  const f = fixture({ enabled: false });
  try {
    await f.mount(); await f.action(tour => tour.start('overview'));
    assert.equal(f.navigation.length, 0); assert.equal(f.get().progress.welcome, 'unseen');
    await f.render({ enabled: true });
    await f.action(tour => tour.start('players'));
    assert.equal(f.get().visible, false);
    await f.fire(5000); assert.equal(f.get().active, null);
    await f.action(tour => tour.start('menu'));
    await f.fire(850); assert.equal(f.get().active, null);
  } finally { await f.close(); }
});

test('target replacement cleanup preserves the current anchor and chapter Back reuses real routes', async () => {
  const f = fixture({ path: '/settings', progress: { ...emptyTourProgress(), welcome: 'later' } });
  try {
    await f.mount();
    const first = { name: 'first' }, second = { name: 'replacement' }; let removeFirst, removeSecond;
    await f.action(tour => { removeFirst = tour.register('settings.profile', first); removeSecond = tour.register('settings.profile', second); removeFirst(); });
    assert.equal(f.get().targets.get('settings.profile'), second);
    await f.action(tour => { tour.start('settings'); tour.next(); });
    assert.equal(f.get().active.index, 1);
    await f.action(tour => tour.back()); assert.equal(f.get().active.index, 0);
    await f.action(() => removeSecond()); assert.equal(f.get().targets.has('settings.profile'), false);
  } finally { await f.close(); }
});

test('opening the highlighted menu advances to the actual Account & settings item', async () => {
  const f = fixture();
  try {
    await f.mount(); await f.action(tour => tour.start('overview'));
    for (const path of ['/rankings', '/calendar', '/']) { await f.action(tour => tour.next()); await f.render({ path }); }
    assert.equal(f.get().step.target, 'header.menu');
    await f.action(tour => tour.menuVisibility(true));
    assert.equal(f.get().step.target, 'menu.settings'); assert.equal(f.get().visible, true);
    await f.action(tour => tour.next()); await f.render({ path: '/settings' });
    assert.equal(f.get().step.target, 'settings.profile');
  } finally { await f.close(); }
});

test('the Messages guide selects All for requests and event chats, then Help for organiser enquiries', async () => {
  const f = fixture({ path: '/messages', progress: { ...emptyTourProgress(), welcome: 'later' } });
  try {
    await f.mount(); await f.action(tour => tour.start('messages'));
    const targets = [];
    for (let i = 0; i < GUIDES.messages.steps.length; i++) {
      targets.push(f.get().step.target);
      const expected = i < 4 ? 'All' : 'Help';
      assert.equal(f.navigation.at(-1).params.filter, expected);
      await f.action(tour => tour.next());
    }
    assert.deepEqual(targets, ['messages.filters', 'messages.requests', 'messages.actions', 'messages.events', 'messages.help', 'messages.helpCompose']);
    assert.ok(f.get().progress.completed.includes('messages'));
    await f.render({ path: '/events/42' });
    const count = f.navigation.length;
    await f.action(tour => tour.start('event'));
    assert.equal(f.navigation.length, count, 'an event guide stays on the event the user selected');
    assert.equal(f.get().visible, true);
    assert.ok(GUIDES.event.steps.some(step => step.target === 'event.save'));
    assert.ok(GUIDES.event.steps.some(step => step.target === 'event.bell'));
  } finally { await f.close(); }
});

function targetComponents() {
  const ctx = load('src/components/guided-tour/context.ts');
  const components = load('src/components/guided-tour/targets.tsx', {
    './context': ctx, '@/lib/guided-tour': lib,
    'react-native': { View: 'View', ScrollView: 'ScrollView', Text: 'Text', Pressable: 'Pressable' },
    'expo-router': { usePathname: () => '/clubs', useFocusEffect: callback => React.useEffect(callback, [callback]) },
    '@expo/vector-icons': { Ionicons: 'Icon' }, '@/hooks/use-reduced-motion': { useReducedMotion: () => true },
  });
  return { ...ctx, ...components };
}

test('native anchors measure, scroll into view with reduced motion and unregister on unmount', async () => {
  const { GuidedTourContext, TourScrollView, TourTarget } = targetComponents();
  const targets = new Map(), scrolls = []; let activated = 0, renderer;
  const guide = { register: (id, target) => { targets.set(id, target); return () => targets.delete(id); } };
  const layout = { padding: 20, gap: 16 };
  try {
    await act(async () => {
      renderer = create(React.createElement(GuidedTourContext.Provider, { value: guide },
        React.createElement(TourScrollView, { contentContainerStyle: layout },
          React.createElement(TourTarget, { id: 'club.actions', onActivate: () => activated++ }, React.createElement('Text', null, 'Save club')))),
      { createNodeMock: element => element.type === 'ScrollView' ? { scrollTo: value => scrolls.push(value) } : { measureInWindow: callback => callback(20, 240, 320, 50), measureLayout: (_relative, callback) => callback(0, 240) } });
    });
    const anchor = targets.get('club.actions'); assert.ok(anchor);
    assert.deepEqual(plain(await anchor.measure()), { x: 20, y: 240, width: 320, height: 50 });
    anchor.reveal(); assert.deepEqual(plain(scrolls), [{ y: 224, animated: false }]);
    assert.equal(activated, 0); anchor.activate(); assert.equal(activated, 1);
    const content = renderer.root.findAllByType('View').find(view => view.props.style === layout);
    assert.ok(content, 'content spacing stays on the direct parent of the original children');
    await act(async () => renderer.unmount()); renderer = null;
    assert.equal(targets.size, 0);
  } finally { if (renderer) await act(async () => renderer.unmount()); }
});

test('contextual invitations dismiss, respect saved progress and offer an intentional replay link', async () => {
  const { GuidedTourContext, ContextualTip } = targetComponents(); let renderer;
  const starts = [], dismissed = [], guide = { ready: true, active: null, welcomeVisible: false, progress: { ...emptyTourProgress(), welcome: 'later' }, start: id => starts.push(id), dismissTip: id => dismissed.push(id) };
  const tree = props => React.createElement(GuidedTourContext.Provider, { value: { ...guide } }, React.createElement(ContextualTip, { chapter: 'clubs', ...props }));
  try {
    await act(async () => { renderer = create(tree()); });
    const buttons = renderer.root.findAllByType('Pressable');
    await act(async () => { buttons[0].props.onPress(); buttons[1].props.onPress(); });
    assert.deepEqual(starts, ['clubs']); assert.deepEqual(dismissed, ['clubs']);
    guide.progress.seen.push('clubs'); await act(async () => renderer.update(tree()));
    assert.equal(renderer.toJSON(), null);
    await act(async () => renderer.update(tree({ replayLabel: 'Club guide' })));
    await act(async () => renderer.root.findByType('Pressable').props.onPress());
    assert.deepEqual(starts, ['clubs', 'clubs']);
    guide.active = { id: 'home' }; await act(async () => renderer.update(tree({ replayLabel: 'Club guide' })));
    assert.equal(renderer.toJSON(), null);
  } finally { if (renderer) await act(async () => renderer.unmount()); }
});

test('Messages shows registered-event channels and supports chat type and archive filters', async () => {
  const channel = { title: 'Example Open', eventId: 42, state: 'accepted', archived: false, unread: 0, preview: '', lastMessageId: null };
  const rows = [
    { ...channel, id: 'announcements', kind: 'event_announcements' },
    { ...channel, id: 'discussion', kind: 'event_discussion' },
    { ...channel, id: 'archived', kind: 'event_announcements', archived: true },
    { ...channel, id: 'player', kind: 'direct', title: 'Alex Player' },
  ];
  const selections = [], opened = [];
  const FlatList = ({ data, ListHeaderComponent, renderItem }) => React.createElement(React.Fragment, null,
    ListHeaderComponent, data.map(item => React.createElement(React.Fragment, { key: item.id }, renderItem({ item }))));
  const screen = load('src/app/(tabs)/messages.tsx', {
    'react-native': { FlatList, ...Object.fromEntries(['Modal', 'Pressable', 'RefreshControl', 'ScrollView', 'Text', 'TextInput', 'View'].map(name => [name, name])) },
    'expo-router': { useLocalSearchParams: () => ({}), useRouter: () => ({ setParams: ({ filter }) => selections.push(filter), push: route => opened.push(route) }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/hooks/use-tab-scene-padding': { useTabScenePadding: () => 0 },
    '@/hooks/use-private-messaging-screen': { usePrivateMessagingScreen: () => true },
    '@/components/messaging/messaging-provider': { useMessagingInbox: () => ({ owner: 'owner', rows, status: { enabled: true, interactive: true, groupsEnabled: true }, badge: 0 }) },
    '@/components/help-inbox-provider': { useHelpInbox: () => ({ unread: 0 }) },
    '@/components/messaging/ui': { ChatAvatar: 'Avatar', ChatButton: 'Button', ChatNotice: 'Notice', ChatPill: 'Pill', chatDate: () => '' },
    '@/components/messaging/event-channels': { EventChannelIcon: 'ChannelIcon', eventChannelStyle: () => ({}) },
    '@/components/messaging/event-chat-filter': load('src/components/messaging/event-chat-filter.tsx', {
      '@/components/select-field': { SelectField: 'EventChatSelect' },
    }),
    '@/components/messaging/message-requests-button': { MessageRequestsButton: 'Requests' },
    '@/components/error-banner': { ErrorBanner: 'Error' },
    '@/components/guided-tour': { TourTarget: 'TourTarget', ContextualTip: 'ContextualTip' },
    '@/lib/help-inbox': load('src/lib/help-inbox.ts'),
    '@/theme/tokens': { lightBrand: {} },
  }, { __DEV__: false }).default;
  let renderer;
  try {
    await act(async () => { renderer = create(React.createElement(screen)); });
    const visibleIds = () => plain(renderer.root.findByType(FlatList).props.data.map(row => row.id));
    const pill = label => renderer.root.findAllByType('Pill').find(item => item.props.children[0] === label);
    assert.deepEqual(visibleIds(), ['announcements', 'discussion', 'player']);
    const filters = renderer.root.findByType('ScrollView');
    assert.equal(filters.props.horizontal, true);
    assert.ok(filters.findAllByType('Pill').includes(pill('Archived')));
    assert.equal(renderer.root.findAllByProps({ accessibilityLabel: 'Event chats' }).length, 0);
    assert.equal(renderer.root.findAllByType('EventChatSelect').length, 0);
    const events = renderer.root.findByProps({ id: 'messages.events' });
    await act(async () => events.props.onActivate());
    assert.equal(pill('Events').props.active, true);
    assert.deepEqual(visibleIds(), ['announcements', 'discussion']);
    const menu = () => renderer.root.findByType('EventChatSelect');
    const selectChatType = async value => act(async () => menu().props.onChange(value));
    assert.deepEqual(plain(menu().props.options.map(option => option.label)), ['All chats', 'Discussions', 'Announcements']);
    await selectChatType('event_discussion');
    assert.deepEqual(visibleIds(), ['discussion']);
    assert.equal(menu().props.value, 'event_discussion');
    await selectChatType('event_announcements');
    assert.deepEqual(visibleIds(), ['announcements']);
    const announcement = renderer.root.findByProps({ accessibilityLabel: 'Example Open. Announcements. ' });
    await act(async () => announcement.props.onPress());
    assert.deepEqual(opened, ['/messages/announcements']);
    await selectChatType('all');
    assert.deepEqual(visibleIds(), ['announcements', 'discussion']);
    await act(async () => pill('Archived').props.onPress());
    assert.equal(pill('Archived').props.active, true);
    assert.equal(renderer.root.findAllByType('EventChatSelect').length, 0);
    assert.deepEqual(visibleIds(), ['archived']);
    assert.deepEqual(selections, ['Events', 'Archived']);
  } finally { if (renderer) await act(async () => renderer.unmount()); }
});

test('event conversation guides cover announcements and both locked and available discussion without joining or reading a chat', async () => {
  for (const unlocked of [false, true]) {
    const calls = [], routes = []; let renderer;
    const channels = [{ id: 'announcements', kind: 'event_announcements', title: 'Example Open', unread: 2 }, ...(unlocked ? [{ id: 'discussion', kind: 'event_discussion', title: 'Example Open', unread: 0 }] : [])];
    const screen = load('src/app/messages/events.tsx', {
      'react-native': Object.fromEntries(['ActivityIndicator', 'FlatList', 'Pressable', 'Text', 'TextInput', 'View'].map(name => [name, name])),
      'expo-router': { Stack: { Screen: 'Screen' }, useLocalSearchParams: () => ({ eventId: '42' }), useRouter: () => ({ push: route => routes.push(route) }) },
      '@expo/vector-icons': { Ionicons: 'Icon' },
      '@/lib/messaging': { messaging: async (action, data) => { calls.push({ action, data }); return channels; } },
      '@/components/messaging/messaging-provider': { useMessagingInbox: () => ({ owner: 'owner', rows: [], status: { interactive: unlocked } }) },
      '@/components/messaging/ui': { ChatButton: 'Button', ChatNotice: 'Notice' },
      '@/components/error-banner': { ErrorBanner: 'Error' },
      '@/components/guided-tour': { TourTarget: 'TourTarget', TourScrollView: 'ScrollView', ContextualTip: 'ContextualTip' },
      '@/components/messaging/event-channels': { EventChannelOption: 'ChannelOption', EventChatHeading: 'ChatHeading', EventDirectoryItem: 'DirectoryItem' },
      '@/hooks/use-private-messaging-screen': { usePrivateMessagingScreen: () => true },
      '@/theme/tokens': { lightBrand: {} },
    }).default;
    try {
      await act(async () => { renderer = create(React.createElement(screen)); await settle(); });
      assert.deepEqual(renderer.root.findAllByType('TourTarget').map(target => target.props.id), ['eventChat.announcements', 'eventChat.discussion']);
      assert.equal(renderer.root.findByType('ContextualTip').props.ready, true);
      const options = renderer.root.findAllByType('ChannelOption');
      assert.equal(options[0].props.kind, 'event_announcements');
      assert.equal(options[1].props.kind, 'event_discussion');
      assert.equal(!!options[1].props.conversation, unlocked);
      assert.deepEqual(plain(calls), [{ action: 'open_event', data: { eventId: 42 } }]);
      assert.equal(routes.length, 0);
    } finally { if (renderer) await act(async () => renderer.unmount()); }
  }
});
