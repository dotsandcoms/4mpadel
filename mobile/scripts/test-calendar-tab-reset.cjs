const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const trigger = Object.assign(() => null, { Label: () => null, Icon: () => null });
let currentNavigation;
let panelPhase;
let panelStates;
let selectedTab;
let supportsExpandableGlass;
const nativeTabs = Object.assign(() => null, { Trigger: trigger });
const glassTabExpansion = () => null;
const modules = {
  react: {
    useState: initial => initial === 'closed'
      ? [panelPhase, value => {
        panelPhase = typeof value === 'function' ? value(panelPhase) : value;
        panelStates.push(panelPhase);
      }]
      : [selectedTab, value => { selectedTab = value; }],
    useCallback: fn => fn,
    useEffect: () => {},
  },
  'react/jsx-runtime': {
    jsx: (type, props) => ({ type, props }),
    jsxs: (type, props) => ({ type, props }),
  },
  'expo-router/unstable-native-tabs': { NativeTabs: nativeTabs },
  'expo-router': { useNavigation: () => currentNavigation, usePathname: () => '/', useFocusEffect: () => {} },
  'react-native': { Platform: { OS: 'ios' } },
  '@/components/app-drawer': { AppDrawer: () => null },
  '@/components/glass-tab-bar': { GlassTabExpansion: glassTabExpansion, get supportsExpandableGlass() { return supportsExpandableGlass; } },
  '@/components/profile-tab-panel': { ProfileTabPanel: () => null },
  '@/components/messaging/messaging-provider': { useMessagingInbox: () => ({ badge: 0 }) },
  '@/lib/haptics': { hapticMedium: () => {} },
  '@/theme/tokens': { lightBrand: { elevated: '#fff', muted: '#aaa', accent: '#000', panel: '#eee' } },
};
const source = fs.readFileSync('src/app/(tabs)/_layout.tsx', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const layoutExports = {};
vm.runInNewContext(compiled, { exports: layoutExports, require: name => modules[name] });

function fixture(selected = 0, depth = 1, glass = false) {
  const actions = [];
  panelStates = [];
  panelPhase = 'closed';
  selectedTab = undefined;
  supportsExpandableGlass = glass;
  const state = {
    type: 'tab', key: 'tabs', index: selected,
    routes: [
      {
        name: '(calendar)',
        state: {
          type: 'stack', key: 'calendar-stack', index: depth,
          routes: [
            { name: 'calendar' },
            ...(depth ? [{ name: 'events/[id]', params: { id: 'nationals', tab: 'Draws' } }] : []),
          ],
        },
      },
      { name: 'profile', state: { type: 'stack', key: 'profile-stack', index: 2 } },
    ],
  };
  const navigation = { getState: () => state, dispatch: action => actions.push(action) };
  currentNavigation = navigation;
  const render = () => layoutExports.default().props.children;
  const [navigator, panel] = render();
  const screens = navigator.props.children;
  const calendar = screens.find(tab => tab.props.name === '(calendar)');
  const profile = screens.find(tab => tab.props.name === 'profile');
  return {
    state, actions, navigator, profile, panel, panelStates, render,
    handlers: {
      ...(calendar.props.listeners?.({ navigation }) ?? {}),
      ...navigator.props.screenListeners,
    },
  };
}

test('opening a player profile over Draws does not clear the active event on blur', () => {
  const f = fixture();
  const before = JSON.stringify(f.state);
  f.handlers.blur?.();
  assert.equal(f.actions.length, 0);
  assert.equal(JSON.stringify(f.state), before);
});

test('pressing Profile expands the panel without changing the selected tab or event stack', () => {
  const f = fixture();
  assert.equal(f.navigator.type, nativeTabs);
  assert.equal(f.profile.props.disabled, true);
  assert.equal(f.profile.props.accessibilityLabel, 'Profile options');
  assert.equal(f.profile.props.children[0].props.children, 'Profile');
  assert.equal(f.panel.props.visible, false);
  f.profile.props.listeners.tabPress();
  assert.deepEqual(f.panelStates, ['open']);
  assert.equal(f.actions.length, 0);
  assert.equal(f.state.routes[0].state.routes[1].params.tab, 'Draws');
  f.handlers.tabPress({ data: { isPrevented: true } });
  assert.deepEqual(f.panelStates, ['open']);
  f.profile.props.listeners.tabPress();
  assert.deepEqual(f.panelStates, ['open', 'closed']);
  f.profile.props.listeners.tabPress();
  f.panel.props.onClose();
  assert.deepEqual(f.panelStates, ['open', 'closed', 'open', 'closed']);
});

test('the native bar still switches tabs while the Profile panel is open', () => {
  const f = fixture();
  f.profile.props.listeners.tabPress();
  f.handlers.tabPress({ data: { isPrevented: false } });
  assert.deepEqual(f.panelStates, ['open', 'closed']);
});

test('supported iPhones show the system bar at rest and preserve the active tab through Profile expansion', () => {
  const f = fixture(0, 1, true);
  assert.equal(f.navigator.type, nativeTabs);
  assert.equal(f.navigator.props.hidden, false);
  assert.equal(f.panel, false);
  f.handlers.state({ data: { state: f.state } });
  f.profile.props.listeners.tabPress();
  const [hiddenBar, expansion] = f.render();
  assert.equal(hiddenBar.type, nativeTabs);
  assert.equal(hiddenBar.props.hidden, true);
  assert.equal(expansion.type, glassTabExpansion);
  assert.equal(expansion.props.activeTab, '(calendar)');
  assert.equal(expansion.props.visible, true);
  assert.deepEqual(f.actions, []);
  expansion.props.onClose();
  const [barDuringCollapse, collapse] = f.render();
  assert.equal(barDuringCollapse.props.hidden, true);
  assert.equal(collapse.props.visible, false);
  assert.equal(collapse.props.restoring, false);
  collapse.props.onRestore();
  const [barDuringHandoff, handoff] = f.render();
  assert.equal(barDuringHandoff.props.hidden, false);
  assert.equal(handoff.props.restoring, true);
  assert.equal(handoff.props.activeTab, '(calendar)');
  collapse.props.onCollapsed();
  const [restoredBar, closed] = f.render();
  assert.equal(restoredBar.props.hidden, false);
  assert.equal(closed, false);
  assert.equal(f.state.routes[0].state.routes[1].params.tab, 'Draws');
});

test('Profile shortcuts use the native glass panel and can be tapped or dragged to', () => {
  const actions = [];
  const panelExports = {};
  const panelSource = fs.readFileSync('src/components/profile-tab-panel.tsx', 'utf8');
  const panelCompiled = ts.transpileModule(panelSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const dragHandlers = {};
  const pan = {};
  for (const method of ['minDistance', 'maxPointers', 'enabled', 'onUpdate', 'onEnd', 'onFinalize']) {
    pan[method] = value => { dragHandlers[method] = value; return pan; };
  }
  const dependencies = {
    ...modules,
    'expo-router': { useRouter: () => ({ navigate: path => actions.push(['navigate', path]), push: path => actions.push(['push', path]) }) },
    'expo-glass-effect': { GlassView: 'Glass', isLiquidGlassAvailable: () => true, isGlassEffectAPIAvailable: () => true },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    'react-native': {
      Pressable: 'Pressable', View: 'View', Text: 'Text', Platform: { OS: 'ios' },
      StyleSheet: { create: styles => styles, absoluteFill: {} }, useWindowDimensions: () => ({ width: 390, fontScale: 1 }),
    },
    'react-native-gesture-handler': { Gesture: { Pan: () => pan }, GestureDetector: 'Gesture' },
    'react-native-reanimated': { default: { View: 'Animated' }, useSharedValue: value => ({ value }), useAnimatedStyle: () => ({}) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 34, left: 0, right: 0 }) },
    'react-native-worklets': { scheduleOnRN: (fn, id) => fn(id) },
    '@/hooks/use-reduced-motion': { useReducedMotion: () => true },
    '@/lib/haptics': { hapticLight: () => {} },
    '@/lib/site': { openSitePath: async path => actions.push(['site', path]) },
  };
  const shortcutExports = {};
  const shortcutSource = fs.readFileSync('src/components/profile-tab-shortcuts.ts', 'utf8');
  const shortcutCompiled = ts.transpileModule(shortcutSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(shortcutCompiled, { exports: shortcutExports, require: name => dependencies[name] });
  dependencies['./profile-tab-shortcuts'] = shortcutExports;
  vm.runInNewContext(panelCompiled, { exports: panelExports, require: name => dependencies[name] });
  const layer = panelExports.ProfileTabPanel({ visible: true, onClose: () => actions.push(['close']) });
  const [dismiss, panel] = layer.props.children;
  assert.equal(layer.props.pointerEvents, 'box-none');
  assert.equal(dismiss.props.style[1].bottom, 99);
  const [glass, gesture] = panel.props.children;
  assert.equal(glass.props.glassEffectStyle, 'clear');
  const [, options] = gesture.props.children.props.children;
  assert.deepEqual(Array.from(options, option => option.props.accessibilityLabel), ['My Profile', 'Coaches', 'Clubs']);
  for (const [index, destination] of [['navigate', '/profile'], ['push', '/coaches'], ['push', '/clubs']].entries()) {
    actions.length = 0;
    options[index].props.onPress();
    assert.deepEqual(actions, [['close'], destination]);
  }
  actions.length = 0;
  dragHandlers.onEnd({ x: 70, y: 130 }, false);
  dragHandlers.onEnd({ x: 300, y: 130 }, true);
  assert.deepEqual(actions, []);
  dragHandlers.onEnd({ x: 70, y: 130 }, true);
  assert.deepEqual(actions, [['close'], ['push', '/clubs']]);
});

test('calendar navigation state stays intact while a root screen covers the active Events tab', () => {
  const f = fixture();
  f.handlers.state?.({ data: { state: f.state } });
  assert.equal(f.actions.length, 0);
  assert.equal(f.state.routes[0].state.routes[1].params.tab, 'Draws');
});

test('switching to a different tab resets only the calendar detail stack', () => {
  const f = fixture(1);
  f.handlers.state?.({ data: { state: f.state } });
  assert.equal(f.actions.length, 1);
  assert.equal(f.actions[0].type, 'POP_TO_TOP');
  assert.equal(f.actions[0].target, 'calendar-stack');
  assert.equal(f.state.routes[1].state.index, 2);
});

test('the calendar root needs no reset and unknown focus cannot discard an event', () => {
  const root = fixture(1, 0);
  root.handlers.state?.({ data: { state: root.state } });
  assert.equal(root.actions.length, 0);
  const unknown = fixture(20);
  unknown.handlers.state?.({ data: { state: unknown.state } });
  assert.equal(unknown.actions.length, 0);
});
