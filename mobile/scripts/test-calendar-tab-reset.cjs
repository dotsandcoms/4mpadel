const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const trigger = Object.assign(() => null, { Label: () => null, Icon: () => null });
let currentNavigation;
const modules = {
  'react/jsx-runtime': {
    jsx: (type, props) => ({ type, props }),
    jsxs: (type, props) => ({ type, props }),
  },
  'expo-router/unstable-native-tabs': { NativeTabs: Object.assign(() => null, { Trigger: trigger }) },
  'expo-router': { useNavigation: () => currentNavigation },
  'react-native': { Platform: { OS: 'ios' } },
  '@/components/app-drawer': { AppDrawer: () => null },
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

function fixture(selected = 0, depth = 1) {
  const actions = [];
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
  const tabs = layoutExports.default().props.children;
  const calendar = tabs.props.children.find(tab => tab.props.name === '(calendar)');
  return {
    state, actions,
    handlers: {
      ...(calendar.props.listeners?.({ navigation }) ?? {}),
      ...tabs.props.screenListeners,
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
