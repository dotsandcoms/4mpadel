const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
const mainRankings = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/sapa-main-ranking.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: mainRankings });
const eventRules = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/event-rules.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: eventRules });

// Render the actual screen with an in-memory hook host and read-only API fixtures.
// This checks its button handlers and conditional branches without a native device.
async function screen(mode, eventOptions = {}, savedCheckout = null, quoteError = null, profileOptions = {}) {
  const values = [], effects = [], focusEffects = [], navigation = [], requests = [], cancelled = [], removed = [];
  const effectDependencies = [], analytics = [], browserVisits = [];
  const player = { id: '1', name: 'Mark', email: 'mark@example.com', contact_number: '0123', license_type: 'full', paid_registration: true, points: 1729, rankedin_id: 'R1', ...profileOptions };
  let savedLevel = profileOptions.playtomic_level ?? null;
  let cursor = 0, mounted = false;
  const hooks = {
    useState(initial) { const i = cursor++; if (!(i in values)) values[i] = typeof initial === 'function' ? initial() : initial; return [values[i], v => { values[i] = typeof v === 'function' ? v(values[i]) : v; }]; },
    useRef(initial) { const i = cursor++; if (!(i in values)) values[i] = { current: initial }; return values[i]; },
    useEffect(fn, deps) {
      const i = cursor++, previous = effectDependencies[i];
      if (!mounted || !deps || !previous || deps.some((value, index) => !Object.is(value, previous[index]))) effects.push(fn);
      effectDependencies[i] = deps;
    },
    useCallback(fn) { cursor++; return fn; },
  };
  const event = { id: 524, event_name: 'Legends', is_manual: true, start_date: '2099-10-02', ...eventOptions };
  const divisions = [{ id: 'men40', name: "Men's 40+", entry_fee: 600 }];
  const partner = { id: '2', name: 'Brad', email: 'brad@example.com', license_type: 'full', paid_registration: true };
  const quote = { mode: mode === 'pay' ? 'pay' : 'register', total: 1200, base: 1200, fee: 0, entries: [{ id: 'reg1', divisionId: 'men40', division: "Men's 40+", playerName: 'Mark', partnerName: 'Brad', partnerEmail: partner.email, paymentStatus: 'pending', partnerPaymentStatus: 'pending', playerCount: 2, unitFee: 600, amount: 1200 }], divisionNames: ["Men's 40+"], lineItems: [], method: 'platform' };
  const router = Object.fromEntries(['back', 'push', 'replace', 'dismissTo'].map(k => [k, v => navigation.push([k, v])])); router.canGoBack = () => true;
  const native = Object.fromEntries(['ActivityIndicator', 'Pressable', 'ScrollView', 'Switch', 'Text', 'TextInput', 'View'].map(k => [k, k]));
  const modules = {
    '@/lib/sapa-main-ranking': mainRankings,
    '@/lib/analytics': { trackEvent: (name, properties) => analytics.push([name, { ...properties }]), recordAnalyticsCheckout() {}, trackConfirmedPurchase() {} },
    '@/components/events/entry-saved-banner': { EntrySavedBanner: 'EntrySavedBanner' },
    '@/components/toast': { Toast: 'Toast' },
    '@/components/events/tshirt-size-picker': { SizePicker: 'SizePicker' },
    '@/components/events/sponsor-details': { SponsorDetails: 'SponsorDetails' },
    react: hooks,
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'Fragment' },
    'react-native': { ...native, Platform: { OS: 'ios' }, Linking: { addEventListener: () => ({ remove() {} }) } },
    '@/lib/payment-return': { parsePaymentReturn: () => null },
    'expo-router': { useLocalSearchParams: () => ({ id: '524', mode, entry: 'reg1' }), useRouter: () => router, useFocusEffect: fn => { const i = cursor++; focusEffects[i] = fn; if (!mounted) effects.push(fn); } },
    '@/lib/foreground-task': { startForegroundTask: () => () => {} },
    'expo-image': { Image: 'Image' }, '@expo/vector-icons': { Ionicons: 'Ionicons' },
    'expo-crypto': { randomUUID: () => 'test-attempt' },
    'expo-web-browser': { openBrowserAsync: async url => { browserVisits.push(url); return { type: 'cancel' }; } }, 'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 20, bottom: 20 }) },
    '@react-native-async-storage/async-storage': { default: { getItem: async () => savedCheckout, setItem: async () => {}, removeItem: async key => removed.push(key) } },
    '@/components/events/event-ui': { ActionButton: 'ActionButton', Chip: 'Chip', Notice: 'Notice' },
    '@/components/events/registration-options': { Choices: 'Choices', DivisionOptions: 'DivisionOptions', LicencePicker: 'LicencePicker' },
    '@/lib/home': { formatEventRange: () => '2–4 Oct' },
    '@/lib/events': { fetchEvent: async () => event, fetchDivisions: async () => divisions, currentEmail: async () => 'mark@example.com', fetchMyEventRegistrations: async () => mode === 'add-partner' ? [{ id: 'reg1', division_id: 'men40', tshirt_size: 'L', payment_status: 'paid' }] : mode === 'pay' ? [{ id: 'reg1', division_id: 'men40', partner_email: partner.email, partner_name: partner.name }] : [], setEventScheduled: async () => {}, eventImage: () => 1 },
    '@/lib/event-rules': { ...eventRules, formatMoney: n => `R ${n}`, entryFee: () => 600, registrationState: event => event.registration_closes_at && new Date(event.registration_closes_at) <= new Date() ? 'closed' : 'open' },
    '@/lib/event-checkout': { invokeCheckout: async (request, checkout) => { const input = { ...request, ...checkout }; requests.push(input); if (quoteError && !input.tshirtSize) throw new Error(quoteError); return eventOptions.deferredSuccess && input.attemptId ? { quote, registered: true, paymentPending: true } : eventOptions.paymentAttempt && input.attemptId ? { quote, reference: 'saved-entry-payment', authorizationUrl: 'https://checkout.paystack.com/test' } : { quote }; },
      eventCheckoutState: async () => ({ state: eventOptions.checkoutState || 'awaiting_payment' }),
      confirmCheckout: async () => { throw Object.assign(new Error('Not paid'), { code: 'PAYMENT_NOT_CONFIRMED' }); },
      cancelEventCheckout: async ref => cancelled.push(ref),
    },
    '@/lib/site': {}, '@/theme/tokens': { brand: {}, lightBrand: {} },
    '@/lib/notifications': { requestPushPermission: async () => true },
    '@/lib/profile-details': { fetchProfileDetails: async () => { if (profileOptions.levelError) throw new Error('Unavailable'); return { playtomic_level: savedLevel, playtomic_no_profile: profileOptions.playtomic_no_profile }; } },
    '@/lib/supabase': { supabase: {
      from: table => { const q = { select: () => q, eq: () => q, ilike: () => q, maybeSingle: async () => ({ data: table === 'players' ? player : {} }) }; return q; },
      rpc: async () => ({ data: [partner] }),
    } },
  };
  const source = ts.transpileModule(fs.readFileSync('src/app/events/register.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: false } }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, require: name => { assert.ok(name in modules, name); return modules[name]; }, __DEV__: true, console, Error, URL, setInterval: () => 0, clearInterval: () => {} });
  const render = () => { cursor = 0; const component = exports.default().type; const tree = component(); mounted = true; return tree; };
  const flush = () => new Promise(resolve => setImmediate(resolve));
  const flushEffects = async () => { render(); effects.splice(0).forEach(fn => fn()); await flush(); };
  await flushEffects();
  function find(type, predicate = () => true) {
    const visit = node => { if (!node || typeof node !== 'object') return; if (Array.isArray(node)) { for (const child of node) { const found = visit(child); if (found) return found; } } else { if ((node.type === type || node.type?.name === type) && predicate(node.props)) return node; return visit(node.props?.children); } };
    return visit(render());
  }
  return { find, navigation, requests, cancelled, removed, analytics, browserVisits, flushEffects, updateProfile: patch => { Object.assign(player, patch); if ('playtomic_level' in patch) savedLevel = patch.playtomic_level; }, focus: async () => { render(); focusEffects.forEach(fn => fn()); await flush(); }, flush };
}
test('RankedIn clicks are attributed separately from the 4M registration funnel', async () => {
  const rankedinUrl = 'https://www.rankedin.com/en/tournament/524';
  const external = await screen(undefined, { is_manual: false, rankedin_url: rankedinUrl });
  await external.flushEffects();
  assert.equal(external.analytics.some(([name]) => name === 'registration_step'), false);
  await external.find('ActionButton', props => props.label === 'Continue to RankedIn ↗').props.onPress();
  assert.deepEqual(external.browserVisits, [rankedinUrl]);
  assert.deepEqual(external.analytics, [['feature_interaction', { feature: 'registration', action: 'external_registration' }]]);

  const manual = await screen(undefined);
  await manual.flushEffects();
  assert.deepEqual(manual.analytics, [['registration_step', { step: 1, flow: 'register', item_count: 0 }]]);
});
test('saved Playtomic level is loaded from private profile details, including zero', async () => {
  for (const level of [0, 3.25]) {
    const app = await screen(undefined, {}, null, null, { playtomic_level: level });
    assert.equal(app.find('Field', p => p.label === 'Playtomic level').props.value, String(level));
    assert.equal(app.find('Field', p => p.label === 'Playtomic level').props.editable, false);
  }
});
test('RankedIn No and an optional missing or unavailable rating do not block Continue', async () => {
  for (const detail of [{}, { levelError: true }, { playtomic_no_profile: true, playtomic_level: 3.25 }]) {
    const app = await screen(undefined, {}, null, null, { ...detail, rankedin_id: null });
    app.find('Choices').props.onChange('no');
    assert.equal(app.find('ActionButton', p => p.label === 'Continue to Division').props.disabled, false);
    assert.equal(app.find('Field', p => p.label === 'Playtomic level').props.value, '');
  }
});
test('missing phone is explained and saving the profile enables Continue on return', async () => {
  const app = await screen(undefined, {}, null, null, { contact_number: ' ', rankedin_id: null });
  app.find('Choices').props.onChange('no');
  assert.equal(app.find('ActionButton', p => p.label === 'Continue to Division').props.disabled, true);
  assert.ok(app.find('Text', p => p.accessibilityRole === 'alert' && p.children.join('').includes('mobile number')));
  app.find('ActionButton', p => p.label === 'Edit my profile').props.onPress();
  assert.deepEqual(app.navigation.at(-1), ['push', '/edit-profile']);
  app.updateProfile({ contact_number: '+27831234567', playtomic_level: 3.5 });
  await app.focus();
  assert.equal(app.find('ActionButton', p => p.label === 'Continue to Division').props.disabled, false);
  assert.equal(app.find('Field', p => p.label === 'Playtomic level').props.value, '3.5');
  app.find('ActionButton', p => p.label === 'Continue to Division').props.onPress();
  assert.ok(app.find('DivisionOptions'));
});
test('an enabled pay-later event saves an unpaid entry through the normal registration flow', async () => {
  const app = await screen(undefined, { weekly_payment_policy: 'allow_reserve', deferredSuccess: true });
  app.find('ActionButton', p => p.label === 'Continue to Division').props.onPress();
  app.find('Choices', p => p.options?.some(option => option.value === 'reserve')).props.onChange('reserve');
  app.find('DivisionOptions').props.onToggle('men40');
  assert.equal(app.find('DivisionOptions').props.deferLicence, true);
  app.find('ActionButton', p => p.label === 'Continue to Review & Pay').props.onPress(); await app.flush();
  assert.equal(app.requests.at(-1).paymentIntent, 'reserve');
  app.find('Agreement', p => p.label.startsWith('I agree')).props.onPress();
  app.find('Agreement', p => p.label.startsWith('I confirm')).props.onPress();
  await app.find('ActionButton', p => p.label === 'Register now, pay later').props.onPress(); await app.flush();
  assert.ok(app.find('Notice', p => p.title === 'Registration received — payment pending'));
});
test('cancelling payment for a saved entry keeps that entry available for later payment', async () => {
  const app = await screen('pay', { paymentAttempt: true });
  app.find('ActionButton', p => p.label === 'Continue to Review & Pay').props.onPress(); await app.flush();
  app.find('Agreement', p => p.label.startsWith('I agree')).props.onPress();
  app.find('Agreement', p => p.label.startsWith('I confirm')).props.onPress();
  await app.find('ActionButton', p => p.label === 'Pay & Complete Registration').props.onPress(); await app.flush();
  assert.ok(app.find('ActionButton', p => p.label === 'Cancel this payment attempt'));
  await app.find('ActionButton', p => p.label === 'Cancel this payment attempt').props.onPress(); await app.flush();
  assert.deepEqual(app.cancelled, ['saved-entry-payment']);
  assert.equal(app.navigation.some(item => item[0] === 'replace'), false);
  assert.ok(app.find('ActionButton', p => p.label === 'Continue to Review & Pay'));
});
test('closing an unpaid checkout requires a fresh registration and releases its hold', async () => {
  const app = await screen(undefined, {}, JSON.stringify({ reference: 'unpaid-attempt', url: 'https://checkout.paystack.com/saved', returnedFromCheckout: true }));
  assert.ok(app.find('Notice', p => p.title === 'Awaiting payment'));
  assert.equal(app.find('ActionButton', p => p.label === 'Continue to checkout'), undefined);
  await app.find('ActionButton', p => p.label === 'I did not pay — start registration again').props.onPress(); await app.flush();
  assert.deepEqual(app.cancelled, ['unpaid-attempt']); assert.equal(app.removed.length, 1);
  assert.equal(app.find('Notice', p => p.title === 'Your entry is confirmed'), undefined);
});
test('expired saved checkouts are discarded instead of reopening a payment URL', async () => {
  const app = await screen(undefined, { checkoutState: 'expired' }, JSON.stringify({ reference: 'expired-attempt', url: 'https://checkout.paystack.com/old' }));
  assert.equal(app.removed.length, 1);
  assert.equal(app.find('ActionButton', p => p.label === 'Continue to checkout'), undefined);
});
test('existing-entry payment opens the existing division step and Back returns there', async () => {
  const app = await screen('pay');
  assert.ok(app.find('Text', p => p.children === "Men's 40+"));
  assert.equal(app.find('Pressable', p => p.accessibilityRole === 'checkbox').props.accessibilityState.checked, true);
  app.find('ActionButton', p => p.label === 'Continue to Review & Pay').props.onPress();
  await app.flush();
  assert.ok(app.find('ActionButton', p => p.label === 'Pay & Complete Registration'));
  app.find('ActionButton', p => p.label === '‹ Back').props.onPress();
  assert.equal(app.find('Pressable', p => p.accessibilityRole === 'checkbox').props.accessibilityState.checked, true);
  assert.equal(app.navigation.length, 0);
  app.find('ActionButton', p => p.label === 'Continue to Review & Pay').props.onPress();
  await app.flush();
  assert.ok(app.find('ActionButton', p => p.label === 'Pay & Complete Registration'));
  assert.equal(app.requests.at(-1).selections[0].partnerEmail, 'brad@example.com');
  assert.equal(app.requests.at(-1).selections[0].payForSelf, true);
  assert.equal(app.requests.at(-1).selections[0].payForPartner, false);
  assert.equal(app.navigation.length, 0);
});

test('closed registration still opens existing-entry payment review', async () => {
  const app = await screen('pay', { registration_closes_at: '2000-01-01' });
  assert.equal(app.find('Notice', p => p.title === 'Registration closed'), undefined);
  app.find('ActionButton', p => p.label === 'Continue to Review & Pay').props.onPress();
  await app.flush();
  assert.ok(app.find('ActionButton', p => p.label === 'Pay & Complete Registration'));
  assert.equal(app.requests.at(-1).mode, 'pay');
  assert.equal(app.find('DivisionOptions'), undefined);
});
test('paying only a partner selects only their fee for review', async () => {
  const app = await screen('pay');
  app.find('Pressable', p => p.accessibilityRole === 'checkbox').props.onPress();
  assert.equal(app.find('ActionButton', p => p.label === 'Continue to Review & Pay').props.disabled, true);
  app.find('Pressable', p => p.accessibilityRole === 'checkbox' && String(p.children?.[1]?.props?.children).includes('Brad')).props.onPress();
  assert.equal(app.find('ActionButton', p => p.label === 'Continue to Review & Pay').props.disabled, false);
  app.find('ActionButton', p => p.label === 'Continue to Review & Pay').props.onPress();
  await app.flush();
  assert.equal(app.requests.at(-1).mode, 'pay');
  assert.equal(app.requests.at(-1).selections[0].payForSelf, false);
  assert.equal(app.requests.at(-1).selections[0].payForPartner, true);
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
test('new registration explains and requires acknowledgment when partner pays separately', async () => {
  const app = await screen();
  app.find('ActionButton', p => p.label === 'Continue to Division').props.onPress();
  app.find('DivisionOptions').props.onToggle('men40');
  app.find('DivisionOptions').props.onChange('men40', { partnerEmail: 'brad@example.com', partnerName: 'Brad', payForPartner: false });
  const requirement = app.find('PartnerPaymentRequirement');
  assert.ok(requirement);
  assert.equal(app.find('ActionButton', p => p.label === 'Continue to Review & Pay').props.disabled, true);
  requirement.props.onPress();
  assert.equal(app.find('ActionButton', p => p.label === 'Continue to Review & Pay').props.disabled, false);
});

test('required-field errors appear in a floating banner without scrolling', async () => {
  const app = await screen(undefined, { collect_tshirt_size: true }, null, 'Select your T-shirt size.');
  app.find('ActionButton', p => p.label === 'Continue to Division').props.onPress();
  app.find('DivisionOptions').props.onToggle('men40');
  app.find('ActionButton', p => p.label === 'Continue to Review & Pay').props.onPress();
  await app.flush();
  assert.equal(app.find('Toast').props.message, 'Select your T-shirt size.');
  assert.equal(app.find('Toast').props.fromTop, true);
  app.find('Toast').props.onDismiss();
  assert.equal(app.find('Toast').props.message, null);
  app.find('ActionButton', p => p.label === 'Continue to Review & Pay').props.onPress();
  await app.flush();
  assert.equal(app.find('Toast').props.message, 'Select your T-shirt size.');
});

test('logo controls follow organiser flags and checkout receives explicit sponsor edits', async () => {
  const hidden = await screen('pay');
  hidden.find('ActionButton', p => p.label === 'Continue to Review & Pay').props.onPress();
  await hidden.flush();
  assert.equal(hidden.find('SponsorDetails'), undefined);
  const app = await screen('pay', { collect_tshirt_size: true, allow_tshirt_logo_upload: true, allow_tshirt_sponsor_name: true });
  app.find('ActionButton', p => p.label === 'Continue to Review & Pay').props.onPress();
  await app.flush();
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

test('saved checkout still opens the division step and can reach review', async () => {
  const app = await screen('pay', {}, JSON.stringify({ reference: 'previous-attempt', url: 'https://checkout.paystack.com/saved', payForPartner: false }));
  assert.ok(app.find('Pressable', p => p.accessibilityRole === 'checkbox'));
  app.find('ActionButton', p => p.label === 'Continue to Review & Pay').props.onPress();
  await app.flush();
  assert.ok(app.find('Text', p => p.children === 'Review & Pay'));
  assert.ok(app.find('ActionButton', p => p.label === 'Pay & Complete Registration'));
  assert.ok(app.find('ActionButton', p => p.label === 'Already paid? Check payment status'));
  assert.equal(app.find('ActionButton', p => p.label === 'Continue to checkout'), undefined);
  assert.ok(app.find('Text', p => p.children === 'Entries'));
  app.find('ActionButton', p => p.label === '‹ Back').props.onPress();
  assert.ok(app.find('Pressable', p => p.accessibilityRole === 'checkbox'));
  assert.equal(app.navigation.length, 0);
});

test('closed private event blocks access code and entry form', async () => {
  const app = await screen(undefined, { registration_access: 'code', registration_closes_at: '2000-01-01T00:00:00Z' });
  assert.ok(app.find('Notice', p => p.title === 'Registration closed'));
  assert.equal(app.find('ActionButton', p => p.label === 'Unlock registration'), undefined);
  assert.equal(app.find('Choices'), undefined);
  assert.equal(app.requests.length, 0);
});


test('add partner opens the existing solo division natively and keeps entry details', async () => {
  const app = await screen('add-partner', { collect_tshirt_size: true });
  const choices = app.find('DivisionOptions').props;
  assert.deepEqual(Array.from(choices.selected), ['men40']);
  assert.equal(choices.registered.length, 0);
  assert.equal(choices.divisions.length, 1);
  assert.equal(app.find('SizePicker', p => p.label === 'Your T-shirt size').props.value, 'L');
  choices.onToggle('men40');
  assert.equal(app.find('DivisionOptions').props.selected[0], 'men40');
  choices.onChange('men40', { partnerEmail: 'brad@example.com', partnerName: 'Brad', payForPartner: true, tshirtSize: 'M' });
  app.find('ActionButton', p => p.label === 'Continue to Review & Pay').props.onPress();
  await app.flush();
  assert.equal(app.requests.at(-1).selections[0].partnerEmail, 'brad@example.com');
  assert.equal(app.requests.at(-1).tshirtSize, 'L');
  assert.equal(app.navigation.length, 0);
});
