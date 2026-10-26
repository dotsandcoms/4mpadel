const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const trigger = Object.assign(() => null, {
  Label: () => null,
  Icon: () => null,
});
const modules = {
  'react/jsx-runtime': {
    jsx: (type, props) => ({ type, props }),
    jsxs: (type, props) => ({ type, props }),
  },
  'expo-router/unstable-native-tabs': { NativeTabs: Object.assign(() => null, { Trigger: trigger }) },
  'react-native': { Platform: { OS: 'ios' } },
  '@/components/app-drawer': { AppDrawer: () => null },
  '@/lib/haptics': { hapticMedium: () => {} },
  '@/theme/tokens': { lightBrand: { elevated: '#fff', muted: '#aaa', accent: '#000', panel: '#eee' } },
};
const source = fs.readFileSync('src/app/(tabs)/_layout.tsx', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
const layoutExports = {};
vm.runInNewContext(compiled, { exports: layoutExports, require: name => modules[name] });
const tabs = layoutExports.default().props.children.props.children;
const calendar = tabs.find(tab => tab.props.name === '(calendar)');

function blurWithState(calendarIndex, otherIndex = 0) {
  const actions = [];
  const navigation = {
    getState: () => ({ routes: [
      { name: '(calendar)', state: { type: 'stack', key: 'calendar-stack', index: calendarIndex } },
      { name: 'profile', state: { type: 'stack', key: 'profile-stack', index: otherIndex } },
    ] }),
    dispatch: action => actions.push(action),
  };
  calendar.props.listeners({ navigation }).blur();
  return actions;
}

test('leaving an event resets the calendar stack to its default page', () => {
  const actions = blurWithState(1);
  assert.equal(actions.length, 1);
  assert.equal(actions[0].type, 'POP_TO_TOP');
  assert.equal(actions[0].target, 'calendar-stack');
});

test('leaving the calendar does not change another tab stack', () => {
  assert.equal(blurWithState(0, 2).length, 0);
});
