const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const runtime = require('react/jsx-runtime');

// Exercise the installed native styling engine. A web-only preview preserves
// Pressable style callbacks and cannot reproduce the missing native card widths.
let dimensions = { width: 390, height: 844, scale: 1, fontScale: 1 };
let rendered = [];
const subscription = () => ({ remove() {} });
const native = {
  Appearance: { getColorScheme: () => 'light', addChangeListener: subscription },
  AppState: { currentState: 'active', addEventListener: subscription },
  AccessibilityInfo: { isReduceMotionEnabled: () => Promise.resolve(false), addEventListener: subscription },
  Dimensions: { get: () => dimensions, addEventListener: subscription },
  Platform: { OS: 'ios', select: values => values.ios ?? values.default },
  PixelRatio: { get: () => 1, getFontScale: () => dimensions.fontScale },
  StyleSheet: { create: styles => styles, absoluteFill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 } },
  useWindowDimensions: () => dimensions,
};
for (const kind of ['View', 'Text', 'TextInput', 'Pressable', 'TouchableOpacity', 'FlatList', 'ScrollView', 'Modal', 'ActivityIndicator']) {
  native[kind] = function NativePrimitive(props) {
    rendered.push({ kind, props });
    return React.createElement(React.Fragment, null, typeof props.children === 'function' ? props.children({ pressed: false }) : props.children);
  };
}
const context = vm.createContext({ console, process, global: {}, __DEV__: false });
const cache = new Map();
function loadInterop(file) {
  if (cache.has(file)) return cache.get(file).exports;
  const mod = { exports: {} }; cache.set(file, mod);
  const localRequire = id => id === 'react-native' ? native : id.startsWith('.') ? loadInterop(require.resolve(path.resolve(path.dirname(file), id))) : require(id);
  vm.runInContext(`(function(require,module,exports){${fs.readFileSync(file, 'utf8')}\n})`, context, { filename: file })(localRequire, mod, mod.exports);
  return mod.exports;
}
const interop = loadInterop(require.resolve('react-native-css-interop/dist/runtime/native/api'));
for (const component of Object.values(native)) if (typeof component === 'function' && component !== native.useWindowDimensions) interop.cssInterop(component, { className: 'style' });
const jsx = (type, props, key) => runtime.jsx(interop.interopComponents.get(type) || type, props, key);
const jsxs = (type, props, key) => runtime.jsxs(interop.interopComponents.get(type) || type, props, key);
const mod = { exports: {} };
const source = ts.transpileModule(fs.readFileSync('src/components/media-screen.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const dependencies = {
  '@/lib/analytics': { trackEvent() {} }, '@/hooks/use-analytics-search': { useAnalyticsSearch() {} },
  react: React, 'react/jsx-runtime': { ...runtime, jsx, jsxs }, 'react-native': native,
  '@expo/vector-icons': { Ionicons: () => null }, 'expo-image': { Image: () => null },
  'expo-router': { Stack: { Screen: () => null }, useRouter: () => ({ push() {} }) },
  'expo-web-browser': {}, 'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
  '@/lib/media': {}, '@/lib/haptics': { hapticLight() {} }, '@/theme/tokens': { lightBrand: {} },
};
vm.runInNewContext(`${source}\nexports.AlbumCard = AlbumCard;`, { module: mod, exports: mod.exports, require: id => {
  if (!(id in dependencies)) throw new Error(`Unexpected dependency: ${id}`);
  return dependencies[id];
} });
function render(element) { rendered = []; renderToStaticMarkup(element); return rendered; }
const album = { id: 'album', title: 'The Cape Town Open- Changan SA Grand Tour', created_at: '2026-10-01' };

for (const width of [320, 390, 430, 768]) test(`native album and photo columns fit a ${width}pt viewport`, () => {
  dimensions = { ...dimensions, width, fontScale: 1 };
  const list = render(React.createElement(mod.exports.MediaScreen)).find(item => item.kind === 'FlatList').props;
  const columns = list.numColumns, gap = list.columnWrapperStyle.gap;
  const padding = list.contentContainerStyle.paddingHorizontal;
  const card = render(list.renderItem({ item: { kind: 'album', album } }));
  const cardStyle = card.find(item => ['TouchableOpacity', 'Pressable'].includes(item.kind)).props.style;
  assert.equal(typeof cardStyle, 'object');
  assert.equal(cardStyle.width, Math.floor((width - padding * 2 - gap * (columns - 1)) / columns));
  assert.ok(cardStyle.width * columns + gap * (columns - 1) + padding * 2 <= width);
  const cover = card.find(item => item.kind === 'View' && item.props.style?.height === cardStyle.width);
  assert.equal(cover.props.style.width, cardStyle.width);
  assert.equal(cover.props.style.height, cardStyle.width);
  const longTitle = card.find(item => item.kind === 'Text' && item.props.children === album.title).props;
  const shortTitle = render(React.createElement(mod.exports.AlbumCard, { album: { ...album, title: 'Short' }, width: cardStyle.width })).find(item => item.kind === 'Text' && item.props.children === 'Short').props;
  assert.equal(longTitle.style.height, shortTitle.style.height);
  assert.equal(longTitle.numberOfLines, 3);
  const photoList = render(React.createElement(mod.exports.MediaScreen, { albumId: album.id })).find(item => item.kind === 'FlatList').props;
  const photo = render(photoList.renderItem({ item: { kind: 'photo', photo: { id: 'photo', image_url: 'https://example.com/photo.jpg' }, index: 0 } })).find(item => ['TouchableOpacity', 'Pressable'].includes(item.kind)).props.style;
  assert.equal(photo.width, photo.height);
  assert.ok(photo.width * columns + photoList.columnWrapperStyle.gap * (columns - 1) + padding * 2 <= width);
});
test('album title space grows with the system font size', () => {
  dimensions = { ...dimensions, fontScale: 1.8 };
  const title = render(React.createElement(mod.exports.AlbumCard, { album, width: 108 })).find(item => item.kind === 'Text' && item.props.children === album.title).props;
  assert.ok(title.style.height >= title.style.lineHeight * title.numberOfLines * dimensions.fontScale);
});
