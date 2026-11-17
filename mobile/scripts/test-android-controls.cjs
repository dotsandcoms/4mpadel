const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, deps = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText,
    { exports, require: name => name === 'react/jsx-runtime' ? require(name) : deps[name] || {} });
  return exports;
}
const tokens = load('src/theme/tokens.ts');
const native = { Pressable: 'Pressable', View: 'View', Text: 'Text', ScrollView: 'ScrollView', useWindowDimensions: () => ({ width: 360, fontScale: 1 }) };
const { HomeAction } = load('src/components/home-action.android.tsx', { 'react-native': native, 'expo-symbols': { SymbolView: 'Symbol' }, './home-action.types': load('src/components/home-action.types.ts'), '@/theme/tokens': tokens });
test('Android header icons use one labelled touch target and fire the action immediately', () => {
  for (const [label, icon] of [['Notifications', 'bell'], ['Search', 'search'], ['Menu', 'menu']]) {
    let presses = 0;
    const button = HomeAction({ label, icon, kind: 'icon', onPress: () => presses++ });
    assert.equal(button.type, 'Pressable'); assert.equal(button.props.accessibilityLabel, label);
    assert.equal(button.props.children.props.pointerEvents, 'none');
    const style = button.props.style({ pressed: false });
    assert.ok(style.minHeight >= 48 && style.minWidth >= 48);
    button.props.onPress(); assert.equal(presses, 1);
  }
});
test('Android shortcuts keep two centred label lines and ordinary actions keep one line', () => {
  const shortcut = HomeAction({ label: 'Find\ntournaments', icon: 'calendar', kind: 'shortcut', onPress() {} });
  const label = shortcut.props.children.props.children.find(child => child && child.type === 'Text');
  assert.equal(label.props.numberOfLines, 2); assert.equal(label.props.style.textAlign, 'center');
  for (const kind of ['outline', 'link', 'primary']) {
    const button = HomeAction({ label: 'My entry', kind, onPress() {} });
    const text = button.props.children.props.children.find(child => child && child.type === 'Text');
    assert.equal(text.props.numberOfLines, 1);
    assert.equal(button.props.children.props.style.backgroundColor, kind === 'primary' ? tokens.lightBrand.messagingAction : kind === 'outline' ? tokens.lightBrand.elevated : tokens.lightBrand.messagingAction + '12');
  }
});
test('Android tabs expose selection and filters keep complete labels at large font sizes', () => {
  let fontScale = 1;
  const { NativeSegmentedControl } = load('src/components/native-segmented-control.android.tsx', { 'react-native': { ...native, useWindowDimensions: () => ({ width: 360, fontScale }) }, '@/theme/tokens': tokens });
  const choices = [{ value: 'all', label: 'All' }, { value: 'men', label: 'Men' }, { value: 'women', label: 'Women' }];
  const changes = [];
  const tabs = NativeSegmentedControl({ label: 'Category', variant: 'tabs', value: 'all', options: choices, onChange: value => changes.push(value) });
  assert.equal(tabs.props.accessibilityRole, 'tablist');
  const buttons = tabs.props.children.props.children;
  assert.equal(buttons[0].props.accessibilityState.selected, true);
  buttons[0].props.onPress(); buttons[2].props.onPress(); assert.deepEqual(changes, ['women']);
  fontScale = 2;
  const filters = NativeSegmentedControl({ label: 'Category', value: 'women', options: choices, onChange() {} });
  assert.equal(filters.props.accessibilityRole, 'radiogroup');
  assert.ok(filters.props.style.height > 48);
  const women = filters.props.children.props.children[2];
  assert.equal(women.props.accessibilityLabel, 'Women'); assert.equal(women.props.accessibilityState.checked, true);
  assert.ok(women.props.style.minWidth >= 120);
  assert.equal(women.props.children.props.children.props.children, 'Women');
});
