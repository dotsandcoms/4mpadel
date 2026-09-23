const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');

// Render the actual screen with an in-memory hook host and read-only API fixtures.
// This checks its button handlers and conditional branches without a native device.
async function screen(mode, eventOptions = {}, savedCheckout = null) {
  const values = [], effects = [], navigation = [], requests = [];
  let cursor = 0, mounted = false;
  const hooks = {
    useState(initial) { const i = cursor++; if (!(i in values)) values[i] = typeof initial === 'function' ? initial() : initial; return [values[i], v => { values[i] = typeof v === 'function' ? v(values[i]) : v; }]; },
    useRef(initial) { const i = cursor++; if (!(i in values)) values[i] = { current: initial }; return values[i]; },
    useEffect(fn) { cursor++; if (!mounted) effects.push(fn); },
  };
  const event = { id: 524, event_name: 'Legends', is_manual: true, start_date: '2099-10-02', ...eventOptions };
  const divisions = [{ id: 'men40', name: "Men's 40+", entry_fee: 600 }];
  const partner = { id: '2', name: 'Brad', email: 'brad@example.com', license_type: 'full', paid_registration: true };
  const quote = { mode: mode === 'pay' ? 'pay' : 'register', total: 1200, base: 1200, fee: 0, entries: [{ id: 'reg1', divisionId: 'men40', division: "Men's 40+", playerName: 'Mark', partnerName: 'Brad', partnerEmail: partner.email, playerCount: 2, unitFee: 600, amount: 1200 }], divisionNames: ["Men's 40+"], lineItems: [], method: 'platform' };
  const router = Object.fromEntries(['back', 'push', 'replace', 'dismissTo'].map(k => [k, v => navigation.push([k, v])])); router.canGoBack = () => true;
  const native = Object.fromEntries(['ActivityIndicator', 'Pressable', 'ScrollView', 'Switch', 'Text', 'TextInput', 'View'].map(k => [k, k]));
  const modules = {
    '@/components/events/tshirt-size-picker': { SizePicker: 'SizePicker' },
    '@/components/events/sponsor-details': { SponsorDetails: 'SponsorDetails' },
    react: hooks,
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'Fragment' },
    'react-native': native,
    'expo-router': { useLocalSearchParams: () => ({ id: '524', mode }), useRouter: () => router },
    'expo-image': { Image: 'Image' }, '@expo/vector-icons': { Ionicons: 'Ionicons' },
    'expo-crypto': { randomUUID: () => 'test-attempt' },
    'expo-web-browser': {}, 'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 20, bottom: 20 }) },
    '@react-native-async-storage/async-storage': { default: { getItem: async () => savedCheckout } },
    '@/components/events/event-ui': { ActionButton: 'ActionButton', Chip: 'Chip', Notice: 'Notice' },
    '@/components/events/registration-options': { Choices: 'Choices', DivisionOptions: 'DivisionOptions', LicencePicker: 'LicencePicker' },
    '@/lib/home': { formatEventRange: () => '2–4 Oct' },
    '@/lib/events': { fetchEvent: async () => event, fetchDivisions: async () => divisions, currentEmail: async () => 'mark@example.com', fetchMyEventRegistrations: async () => mode === 'pay' ? [{ id: 'reg1', division_id: 'men40', partner_email: partner.email, partner_name: partner.name }] : [], eventImage: () => 1 },
    '@/lib/event-rules': { formatMoney: n => `R ${n}`, entryFee: () => 600, registrationState: () => 'open' },
    '@/lib/event-checkout': { invokeCheckout: async input => { requests.push(input); return { quote }; } },
    '@/lib/site': {}, '@/theme/tokens': { brand: {}, lightBrand: {} },
    '@/lib/supabase': { supabase: {
      from: table => { const q = { select: () => q, eq: () => q, ilike: () => q, maybeSingle: async () => ({ data: table === 'players' ? { id: '1', name: 'Mark', email: 'mark@example.com', contact_number: '0123', license_type: 'full', paid_registration: true, points: 1729, rankedin_id: 'R1' } : {} }) }; return q; },
      rpc: async () => ({ data: [partner] }),
    } },
  };
  const source = ts.transpileModule(fs.readFileSync('src/app/events/register.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: false } }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, require: name => { assert.ok(name in modules, name); return modules[name]; }, __DEV__: true, console });
  const render = () => { cursor = 0; const component = exports.default().type; const tree = component(); mounted = true; return tree; };
  render(); effects.forEach(fn => fn());
  await new Promise(resolve => setImmediate(resolve));
  function find(type, predicate = () => true) {
    const visit = node => { if (!node || typeof node !== 'object') return; if (Array.isArray(node)) { for (const child of node) { const found = visit(child); if (found) return found; } } else { if (node.type === type && predicate(node.props)) return node; return visit(node.props?.children); } };
    return visit(render());
  }
  return { find, navigation, requests, flush: () => new Promise(resolve => setImmediate(resolve)) };
}
test('existing-entry Review & Pay Back returns to restored divisions without leaving registration', async () => {
  const app = await screen('pay');
  assert.ok(app.find('ActionButton', p => p.label === 'Pay & Complete Registration'));
  app.find('ActionButton', p => p.label === '‹ Back').props.onPress();
  const choices = app.find('DivisionOptions');
  assert.ok(choices);
  assert.deepEqual(Array.from(choices.props.selected), ['men40']);
  assert.equal(choices.props.values.men40.partnerName, 'Brad');
  assert.equal(choices.props.values.men40.payForPartner, true);
  assert.equal(app.navigation.length, 0);
  app.find('ActionButton', p => p.label === 'Continue to Review & Pay').props.onPress();
  await app.flush();
  assert.ok(app.find('ActionButton', p => p.label === 'Pay & Complete Registration'));
  assert.equal(app.requests.at(-1).selections[0].partnerEmail, 'brad@example.com');
  assert.equal(app.navigation.length, 0);
});
test('new registration preserves each division partner when returning from review', async () => {
  const app = await screen();
  assert.ok(app.find('Choices'));
  app.find('ActionButton', p => p.label === 'Continue to Division').props.onPress();
  app.find('DivisionOptions').props.onToggle('men40');
  app.find('DivisionOptions').props.onChange('men40', { partnerEmail: 'brad@example.com', partnerName: 'Brad', payForPartner: true });
  app.find('ActionButton', p => p.label === 'Continue to Review & Pay').props.onPress();
  await app.flush();
  app.find('ActionButton', p => p.label === '‹ Back').props.onPress();
  const choices = app.find('DivisionOptions').props;
  assert.equal(choices.values.men40.partnerName, 'Brad');
  assert.equal(choices.selected[0], 'men40');
  assert.equal(app.navigation.length, 0);
});

test('logo controls follow organiser flags and checkout receives explicit sponsor edits', async () => {
  const hidden = await screen('pay');
  assert.equal(hidden.find('SponsorDetails'), undefined);
  const app = await screen('pay', { collect_tshirt_size: true, allow_tshirt_logo_upload: true, allow_tshirt_sponsor_name: true });
  const self = app.find('SponsorDetails', p => p.email === 'mark@example.com');
  assert.ok(self);
  self.props.onBusyChange(true);
  assert.equal(app.find('ActionButton', p => p.label === 'Pay & Complete Registration').props.busy, true);
  self.props.onChange({ tshirtLogoUrl: 'https://example.test/logo.png', tshirtSponsorName: 'NOX' });
  self.props.onBusyChange(false);
  app.find('ActionButton', p => p.label === 'Pay & Complete Registration').props.onPress();
  await app.flush();
  assert.equal(app.requests.at(-1).tshirtLogoUrl, 'https://example.test/logo.png');
  assert.equal(app.requests.at(-1).tshirtSponsorName, 'NOX');
  app.find('ActionButton', p => p.label === '‹ Back').props.onPress();
  app.find('ActionButton', p => p.label === 'Continue to Review & Pay').props.onPress();
  await app.flush();
  assert.equal(app.find('SponsorDetails', p => p.email === 'mark@example.com').props.logo, 'https://example.test/logo.png');
});

test('Pay Now opens Review & Pay even when an earlier checkout was saved', async () => {
  const app = await screen('pay', {}, JSON.stringify({ reference: 'previous-attempt', url: 'https://checkout.paystack.com/saved', payForPartner: false }));
  assert.ok(app.find('Text', p => p.children === 'Review & Pay'));
  assert.ok(app.find('ActionButton', p => p.label === 'Pay & Complete Registration'));
  assert.ok(app.find('ActionButton', p => p.label === 'Already paid? Check payment status'));
  assert.equal(app.find('ActionButton', p => p.label === 'Continue to checkout'), undefined);
  assert.ok(app.find('Text', p => p.children === 'Entries'));
  app.find('ActionButton', p => p.label === '‹ Back').props.onPress();
  assert.ok(app.find('DivisionOptions'));
  assert.equal(app.navigation.length, 0);
});
