const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
const reference = 'MBAL-' + 'a'.repeat(48);
async function screen(returning = false, paid = true) {
  let cursor = 0, mounted = false;
  const states = [], effects = [], calls = [], browsers = [], routes = [];
  const quote = { eventId: 1, eventName: 'Test', registrationId: 'r1', division: 'Open', paid: 1, price: 1.5, due: .5, total: .5 };
  const modules = {
    react: { useState: initial => { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], v => states[i] = v]; }, useRef: initial => { const i = cursor++; if (!(i in states)) states[i] = { current: initial }; return states[i]; }, useEffect: fn => { cursor++; if (!mounted) effects.push(fn); } },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'Fragment' },
    'react-native': { ...Object.fromEntries(['ActivityIndicator', 'Pressable', 'ScrollView', 'Text', 'View'].map(x => [x, x])), Platform: { OS: 'ios' }, Linking: { addEventListener: () => ({ remove() {} }) } },
    'expo-router': { Stack: { Screen: 'Stack' }, useLocalSearchParams: () => returning ? { reference } : { registrationId: 'r1', targetDivisionId: 'd2' }, useRouter: () => ({ back() {}, replace: v => routes.push(v) }) },
    'expo-web-browser': { openBrowserAsync: async url => { browsers.push(url); return { type: 'dismiss' }; } },
    '@/lib/event-rules': { formatMoney: n => `R ${n}` }, '@/theme/tokens': { lightBrand: {} },
    '@/lib/supabase': { supabase: { functions: { invoke: async (name, { body }) => { calls.push(body); return { data: body.action === 'confirm' ? paid ? { paid: true, eventId: 1, balance: { due: 0, division: 'Open' } } : { pending: true, message: 'Payment not confirmed' } : body.action === 'quote' ? { quote } : { quote, reference, authorizationUrl: 'https://checkout.paystack.com/test' } }; } } } },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/events/pay-balance.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, require: name => modules[name], console });
  const render = () => { cursor = 0; const tree = exports.default(); mounted = true; return tree; };
  function find(label) {
    function walk(n) { if (!n || typeof n !== 'object') return; if (Array.isArray(n)) { for (const child of n) { const found = walk(child); if (found) return found; } } else { if (n.type === 'Pressable' && n.props.children?.props?.children === label) return n; return walk(n.props?.children); } }
    return walk(render());
  }
  render(); effects.forEach(f => f());
  await new Promise(r => setImmediate(r));
  return { calls, browsers, routes, find, flush: () => new Promise(r => setImmediate(r)) };
}
test('native balance review pays R0.50, verifies after browser closes, then opens native entry', async () => {
  const app = await screen();
  app.find('Pay balance · R 0.5').props.onPress(); await app.flush();
  assert.equal(app.calls[1].acceptedTotal, .5);
  assert.equal(app.browsers[0], 'https://checkout.paystack.com/test');
  assert.equal(app.calls[2].action, 'confirm');
  assert.equal(app.calls[2].reference, reference);
  app.find('View my entry').props.onPress();
  assert.equal(app.routes[0].pathname, '/events/[id]');
});
test('cold payment return verifies the reference without initializing another payment', async () => {
  const app = await screen(true);
  assert.ok(app.find('View my entry'));
  assert.deepEqual(app.calls.map(c => c.action), ['confirm']);
  assert.equal(app.browsers.length, 0);
});
test('cancelled or pending payment offers a status retry without showing success', async () => {
  const app = await screen(true, false);
  assert.equal(app.find('View my entry'), undefined);
  app.find('Check payment status').props.onPress(); await app.flush();
  assert.deepEqual(app.calls.map(c => c.action), ['confirm', 'confirm']);
  assert.equal(app.browsers.length, 0);
});
