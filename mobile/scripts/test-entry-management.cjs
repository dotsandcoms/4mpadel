const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
function screen(partner = true, open = true, higher = false, balance = undefined, registrations = undefined) {
  let cursor = 0;
  const state = [], routes = [], calls = [], manageCalls = [];
  const modules = {
    react: { useEffect() {}, useState: value => { const i = cursor++; if (!(i in state)) state[i] = value; return [state[i], next => state[i] = next]; } },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'Fragment' },
    'react-native': Object.fromEntries(['ActivityIndicator', 'Modal', 'Pressable', 'ScrollView', 'View'].map(x => [x, x])),
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    './website-ui': { Accordion: 'Accordion', EventIcon: 'Icon', EventText: 'Text', useEventAccent: () => '#d4ff00' },
    './event-teams': { PlayerAvatar: 'Avatar' },
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    '@/theme/tokens': { lightBrand: { page: '#F5F6F3', elevated: '#fff', surface: '#eee', premium: '#16251F', muted: '#52625A', faint: '#65726B', accent: '#386018', edge: '#DCE2DA', padel: '#CCFF00', danger: '#B7352D' } },
    '@/lib/event-rules': { formatMoney: n => `R ${n}`, entryFee: (_event, division) => division?.entry_fee || 100, registrationState: () => open ? 'open' : 'closed' },
    'expo-router': { useRouter: () => ({ push: value => routes.push(value) }) },
    '@/lib/supabase': { supabase: { functions: { invoke: async (...args) => { calls.push(args); return { data: {} }; } } } },
  };
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync('src/components/events/registration-entries.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(source, { exports, require: name => { assert.ok(modules[name], name); return modules[name]; } });
  const props = { event: { id: 553, event_name: 'Test' }, divisions: [{ id: 'd1', entry_fee: 100 }, ...(higher ? [{ id: 'd2', name: 'Advanced', entry_fee: 250 }] : [])], registrations: registrations ?? [{ id: 'r1', division_id: 'd1', division: 'Open', full_name: 'Brad', email: 'brad@test.test', registered_by: 'brad@test.test', partner_email: partner ? 'partner@test.test' : null, partner_name: partner ? 'Partner' : null, payment_status: 'paid', balance }], profiles: [], onRefresh: async () => {}, onManage: (...args) => manageCalls.push(args) };
  function find(predicate) {
    cursor = 0;
    const tree = exports.RegistrationEntries(props);
    function visit(node) {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) { for (const child of node) { const result = visit(child); if (result) return result; } return; }
      if (predicate(node)) return node;
      if (node.type === 'Modal' && !node.props.visible) return;
      return visit(node.props?.children);
    }
    return visit(tree);
  }
  return { find, routes, calls, manageCalls };
}
test('management opens a native sheet and partner removal calls the authenticated refund service', async () => {
  const app = screen();
  app.find(n => n.props?.accessibilityLabel === 'Manage partner Partner').props.onPress();
  assert.ok(app.find(n => n.props?.children === 'Manage entry'));
  app.find(n => n.props?.label === 'Remove partner').props.onPress();
  const confirm = app.find(n => n.type === 'Pressable' && n.props.children?.props?.children === 'Confirm partner removal');
  assert.ok(confirm);
  await confirm.props.onPress();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.calls[0][0], 'paystack-refund');
  assert.equal(app.calls[0][1].body.action, 'remove_partner');
  assert.equal(app.calls[0][1].body.registration_id, 'r1');
  assert.equal(app.routes.length, 0);
});
test('solo entry adds a partner through the native registration route', () => {
  const app = screen(false);
  assert.equal(app.find(n => n.props?.label === 'Manage partners / entry details'), undefined);
  app.find(n => n.props?.accessibilityLabel === 'Add partner to entry').props.onPress();
  assert.equal(app.routes[0].pathname, '/events/register');
  assert.equal(app.routes[0].params.mode, 'add-partner');
  assert.equal(app.routes[0].params.entry, 'r1');
});
test('entry summary keeps payments in Manage entry and offers one clear registration action', () => {
  const registrations = ['Open', 'Advanced'].map((division, index) => ({ id: `r${index + 1}`, division_id: `d${index + 1}`, division, full_name: 'Brad', email: 'brad@test.test', registered_by: 'brad@test.test', partner_email: null, partner_name: null, payment_status: 'pending' }));
  const app = screen(false, true, true, undefined, registrations);
  assert.equal(app.find(n => n.props?.accessibilityLabel?.startsWith('Pay now for')), undefined);
  assert.equal(app.find(n => n.props?.children === 'Pay Entry'), undefined);
  const register = app.find(n => n.props?.accessibilityLabel === 'Register another division');
  assert.ok(register.props.style.minHeight >= 48);
  register.props.onPress();
  assert.equal(app.manageCalls.length, 1);
});
test('closed entry remains viewable without partner mutations', () => {
  const app = screen(true, false);
  assert.equal(app.find(n => n.props?.accessibilityLabel === 'Manage partner Partner').props.disabled, true);
  assert.equal(app.find(n => n.props?.label === 'Manage partners / entry details'), undefined);
});

test('higher-priced switch routes to native payment review', async () => {
  const app = screen(true, true, true);
  app.find(n => n.props?.accessibilityLabel === 'Manage partner Partner').props.onPress();
  app.find(n => n.props?.label === 'Switch division').props.onPress();
  app.find(n => n.props?.accessibilityRole === 'radio').props.onPress();
  const review = app.find(n => n.type === 'Pressable' && n.props.children?.props?.children === 'Review additional payment');
  assert.equal(review.props.disabled, false);
  await review.props.onPress();
  assert.equal(app.routes[0].pathname, '/events/switch-division');
  assert.equal(app.routes[0].params.registrationId, 'r1');
  assert.equal(app.routes[0].params.targetDivisionId, 'd2');
  assert.equal(app.calls.length, 0);
});

test('price increase displays outstanding amount and routes balance payment natively',()=>{
  const app=screen(true,true,false,{known:true,paid:1,price:1.5,due:.5});
  app.find(n=>n.props?.accessibilityLabel==='Manage partner Partner').props.onPress();
  assert.ok(app.find(n=>n.props?.children==='R 0.5 outstanding'));
  app.find(n=>n.props?.label==='Pay balance · R 0.5').props.onPress();
  assert.equal(app.routes[0].pathname,'/events/pay-balance');
  assert.equal(app.routes[0].params.registrationId,'r1');
});
