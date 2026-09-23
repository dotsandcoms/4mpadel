const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function host() {
  const state = [], effects = [], timers = new Map(), calls = [];
  let cursor = 0, timerId = 0;
  const props = { value: {}, onChange(value) { props.value = value; }, eventId: 524, divisionId: 'men40', profileId: 'self', busy: false };
  const hooks = {
    useState(initial) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = value; }]; },
    useRef(initial) { const i = cursor++; return state[i] ||= { current: initial }; },
    useEffect(fn, deps) { const i = cursor++; const old = effects[i]; if (!old || deps.some((v, j) => v !== old.deps[j])) { old?.cleanup?.(); effects[i] = { deps, cleanup: fn() }; } },
  };
  const modules = {
    react: hooks,
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'react-native': { Keyboard: { dismiss() {} }, ...Object.fromEntries(['ActivityIndicator', 'Pressable', 'ScrollView', 'Text', 'TextInput', 'View'].map(n => [n, n])) },
    'expo-image': { Image: 'Image' }, '@/theme/tokens': { brand: {} }, './event-ui': {}, '@/lib/event-rules': {},
    '@/lib/supabase': { supabase: { rpc: (name, args) => name === 'get_event_registrations_for_matching' ? Promise.resolve({ data: [{ email: 'brad@example.com', division_id: 'men40' }] }) : new Promise(resolve => calls.push({ name, args, resolve })) } },
  };
  const source = fs.readFileSync('src/components/events/registration-options.tsx', 'utf8') + '\nexport { PartnerSearch, hasSoloEntry, getPartnerAvailability };';
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, require: n => { assert.ok(n in modules, n); return modules[n]; },
    setTimeout: (fn, delay) => { assert.equal(delay, 300); timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id),
  });
  const render = () => { cursor = 0; return exports.PartnerSearch(props); };
  function find(type) {
    const found = [];
    function visit(node) { if (Array.isArray(node)) node.forEach(visit); else if (node && typeof node === 'object') { if (node.type === type) found.push(node); visit(node.props?.children); } }
    visit(render()); return found;
  }
  return { calls, props, timers, render, find, hasSoloEntry: exports.hasSoloEntry, availability: exports.getPartnerAvailability,
    type(q) { find('TextInput')[0].props.onChangeText(q); render(); },
    tick() { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); },
    unmount() { effects.forEach(e => e?.cleanup?.()); },
    flush: () => new Promise(resolve => setImmediate(resolve)),
  };
}

test('typing debounces partner lookup, trims query and preserves event/self filters', async () => {
  const h = host(); h.type('B'); assert.equal(h.timers.size, 0);
  h.type('Br'); h.type('Bra'); h.type(' Brad ');
  assert.equal(h.timers.size, 1); assert.equal(h.calls.length, 0);
  h.tick(); assert.equal(h.calls.length, 1);
  assert.equal(JSON.stringify(h.calls[0].args), JSON.stringify({ p_search: 'Brad', p_exclude_id: 'self', p_event_id: 524 }));
  h.calls[0].resolve({ data: [{ id: 'brad', name: 'Brad', email: 'brad@example.com' }] }); await h.flush();
  assert.equal(h.find('Pressable').length, 1);
  assert.match(h.find('Pressable')[0].props.accessibilityLabel, /Solo entry/);
  assert.equal(h.find('ScrollView')[0].props.style.maxHeight, 192);
  assert.equal(h.find('ScrollView')[0].props.nestedScrollEnabled, true);
  assert.equal(h.find('ScrollView')[0].props.keyboardShouldPersistTaps, 'handled');
  h.find('Pressable')[0].props.onPress(); h.render();
  assert.equal(h.props.value.partnerName, 'Brad'); assert.equal(h.timers.size, 0);
});

test('out-of-order responses and cleared queries cannot repopulate stale results', async () => {
  const h = host(); h.type('Brad'); h.tick(); h.type('Jane'); h.tick();
  h.calls[1].resolve({ data: [{ id: 'jane', name: 'Jane' }] }); await h.flush();
  h.calls[0].resolve({ data: [{ id: 'brad', name: 'Brad', email: 'brad@example.com' }] }); await h.flush();
  assert.ok(JSON.stringify(h.render()).includes('Jane')); assert.ok(!JSON.stringify(h.render()).includes('Brad'));
  h.type('Jo'); h.tick(); h.type('');
  h.calls[2].resolve({ data: [{ id: 'jo', name: 'Jo' }] }); await h.flush();
  assert.equal(h.find('Pressable').length, 0);
  h.type('Brad'); h.unmount(); assert.equal(h.timers.size, 0);
});

 test('solo labels match division and exclude withdrawn or paired entries, including active inviter links', () => {
  const { hasSoloEntry } = host();
  const entry = { email: ' BRAD@example.com ', division_id: 'men40' };
  assert.equal(hasSoloEntry([entry], 'men40', 'brad@example.com'), true);
  assert.equal(hasSoloEntry([entry], 'men45', 'brad@example.com'), false);
  for (const extra of [{ status: 'withdrawn' }, { partner_name: 'Mark' }, { partner_email: 'mark@example.com' }]) {
    assert.equal(hasSoloEntry([{ ...entry, ...extra }], 'men40', 'brad@example.com'), false);
  }
  const invited = { ...entry, registered_by: 'mark@example.com' };
  assert.equal(hasSoloEntry([invited], 'men40', 'brad@example.com'), true);
  assert.equal(hasSoloEntry([invited, { email: 'mark@example.com', division_id: 'men40', partner_email: 'brad@example.com' }], 'men40', 'brad@example.com'), false);
});

test('website availability rules block paired candidates but allow solo and mutual partner reselection', () => {
  const { availability } = host();
  const player = { email: 'brad@example.com', name: 'Brad' };
  const entry = { email: player.email, division_id: 'men40', partner_email: 'mark@example.com', partner_name: 'Mark' };
  const check = (rows, self = 'other@example.com') => availability(rows, 'men40', player, "Men's 40+", self);
  assert.equal(check([entry]).ok, false);
  assert.match(check([entry]).message, /already partnered with Mark/);
  assert.equal(check([{ ...entry, division_id: 'men45' }]).ok, true);
  assert.equal(check([{ ...entry, status: 'withdrawn' }]).ok, true);
  assert.equal(check([{ email: 'mark@example.com', partner_email: player.email, division_id: 'men40' }]).ok, false);
  const mutual = [entry, { email: 'mark@example.com', partner_email: player.email, division_id: 'men40' }];
  assert.equal(check(mutual, 'mark@example.com').ok, true);
  assert.equal(check(mutual).ok, false);
});
