const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Run the screen's actual controls with isolated navigation, storage and hooks.
function screen(markSeen = async () => {}) {
  const hooks = [], paths = [];
  let cursor = 0;
  const ref = value => hooks[cursor++] ??= { current: value };
  const react = {
    useRef: ref,
    useState(value) {
      const slot = cursor++;
      hooks[slot] ??= { value };
      return [hooks[slot].value, next => { hooks[slot].value = next; }];
    },
    useCallback: fn => fn,
    useMemo: fn => fn(),
  };
  const jsx = (type, props) => ({ type, props });
  const modules = {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'expo-image': { Image: 'Image' },
    'expo-router': { useRouter: () => ({ replace: path => paths.push(path) }) },
    'react-native': { Pressable: 'Pressable', ScrollView: 'ScrollView', Text: 'Text', View: 'View', useWindowDimensions: () => ({ width: 412, height: 914 }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 24 }) },
    'react-native-gesture-handler': {
      GestureHandlerRootView: 'GestureHandlerRootView', GestureDetector: 'GestureDetector',
      Gesture: { Pan: () => { const pan = {}; for (const key of ['activeOffsetX', 'failOffsetY', 'onEnd']) pan[key] = () => pan; return pan; } },
    },
    'react-native-reanimated': {
      __esModule: true, default: { View: 'AnimatedView' },
      useSharedValue: value => { const slot = ref({ value }); return slot.current; },
    },
    '@/components/onboarding-previews': Object.fromEntries(['EventsPreview', 'TournamentFollowPreview', 'WorldPadelPreview', 'PartnerPreview', 'RankingPreview'].map(name => [name, name])),
    '@/components/pressable-scale': { PressableScale: 'PressableScale' },
    '@/components/observe-ready': { ObserveReady: 'ObserveReady' },
    '@/hooks/use-reduced-motion': { useReducedMotion: () => false },
    '@/lib/haptics': { hapticLight() {}, hapticMedium() {} },
    '@/lib/onboarding': { markOnboardingSeen: markSeen },
    '@/theme/tokens': { lightBrand: {}, motion: {} },
  };
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/(auth)/onboarding.tsx', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { module: mod, exports: mod.exports, require: name => modules[name] ?? {}, Date });
  function render() { cursor = 0; return mod.exports.default(); }
  function find(tree, label) {
    if (!tree || typeof tree !== 'object') return null;
    if (tree.props?.accessibilityLabel === label) return tree;
    for (const child of [tree.props?.children].flat(Infinity)) {
      const found = find(child, label); if (found) return found;
    }
    return null;
  }
  return { render, find, paths };
}

test('two rapid Next taps advance two slides during animation', () => {
  const h = screen(), next = h.find(h.render(), 'Next');
  next.props.onPress(); next.props.onPress();
  assert.ok(h.find(h.render(), 'Onboarding, slide 3 of 5'));
});

test('Skip navigates immediately even when storage never resolves', () => {
  const h = screen(() => new Promise(() => {}));
  h.find(h.render(), 'Skip onboarding').props.onPress();
  assert.deepEqual(h.paths, ['/(auth)/sign-in']);
});

test('all five slides finish in signup without waiting for storage', () => {
  const h = screen(() => new Promise(() => {}));
  for (let i = 1; i < 5; i++) h.find(h.render(), 'Next').props.onPress();
  h.find(h.render(), 'Build my player profile').props.onPress();
  assert.deepEqual(h.paths, ['/(auth)/sign-in?intent=signup']);
});

test('Skip remains available on the final slide; repeated taps navigate once', () => {
  const h = screen();
  for (let i = 1; i < 5; i++) h.find(h.render(), 'Next').props.onPress();
  const skip = h.find(h.render(), 'Skip onboarding');
  assert.ok(skip);
  skip.props.onPress(); skip.props.onPress();
  assert.deepEqual(h.paths, ['/(auth)/sign-in']);
});
