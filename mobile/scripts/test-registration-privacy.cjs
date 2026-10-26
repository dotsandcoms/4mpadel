const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, modules = {}) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { module: mod, exports: mod.exports, require: name => modules[name] ?? {}, console });
  return mod.exports;
}

const registration = load('src/lib/registration.ts');
const preferences = load('src/lib/player-preferences.ts');
const sponsors = load('src/lib/sponsors.ts');
const optionalFields = ['ID / passport', 'Mobile number', 'Gender', 'Nationality', 'Region'];
const optionalKeys = ['p_id_number', 'p_contact', 'p_gender', 'p_nationality', 'p_region'];

// Exercise the screen's actual controls and profile payload without creating live accounts.
async function screen({ os = 'ios', saved = null, edit = false, playerOverrides = {} } = {}) {
  const hooks = [], effects = [], paths = [], requests = [], updates = [], drafts = [];
  let cursor = 0;
  const react = {
    useState(initial) {
      const slot = cursor++;
      hooks[slot] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [hooks[slot].value, next => {
        hooks[slot].value = typeof next === 'function' ? next(hooks[slot].value) : next;
      }];
    },
    useRef(initial) { return hooks[cursor++] ??= { current: initial }; },
    useCallback: fn => fn,
    useMemo: fn => fn(),
    useEffect(fn) {
      const slot = cursor++;
      if (!hooks[slot]) { hooks[slot] = {}; effects.push(fn); }
    },
  };
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { email: 'player@example.com', user_metadata: {} } } }) },
    rpc: async (name, payload) => { requests.push([name, payload]); return { error: null }; },
  };
  const profile = load('src/lib/profile.ts', {
    './supabase': { supabase },
    '@/lib/player-preferences': preferences,
    '@/lib/welcome-email': { queueWelcomeEmail: async () => {} },
    './signup-source': { resolveSignupSource: () => 'mobile', collectSignupDevice: () => os },
  });
  const player = {
    id: 42, name: 'Test Player', contact_number: null, region: null,
    category: "Men's Intermediate", club_id: 'club-1', home_club: 'Test Club',
    bio: 'I enjoy padel.', racket_brand: 'Adidas', ...playerOverrides,
  };
  const jsx = (type, props) => ({ type, props });
  const modules = {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { Platform: { OS: os } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    'expo-router': {
      useRouter: () => ({ replace: path => paths.push(path), canGoBack: () => true, back: () => paths.push('back') }),
      useFocusEffect: fn => react.useEffect(fn),
    },
    '@/components/field-colors': { FieldColors: { Provider: 'Provider' }, profileColors: {} },
    '@/theme/tokens': { lightBrand: {} },
    '@/hooks/use-reduced-motion': { useReducedMotion: () => true },
    '@/lib/registration': registration,
    '@/lib/player-preferences': preferences,
    '@/lib/sponsors': sponsors,
    '@/lib/supabase': { supabase },
    '@/lib/analytics': { trackEvent: async () => {} },
    '@/lib/profile': {
      ...profile,
      fetchClubs: async () => [{ id: 'club-1', name: 'Test Club' }],
      loadProfileDraft: async () => saved,
      saveProfileDraft: async draft => drafts.push(draft),
      clearProfileDraft: async () => {},
      fetchProfileBundle: async () => ({ player }),
      updatePlayerDetails: async (id, data) => updates.push({ id, ...data }),
    },
  };
  const component = load(edit ? 'src/app/edit-profile.tsx' : 'src/app/(auth)/complete-profile.tsx', modules).default;
  function render() { cursor = 0; return component(); }
  function find(tree, predicate) {
    if (!tree || typeof tree !== 'object') return null;
    if (predicate(tree.props ?? {})) return tree;
    for (const child of [tree.props?.children].flat(Infinity)) {
      const match = find(child, predicate);
      if (match) return match;
    }
    return null;
  }
  function field(label) {
    const node = find(render(), props => props.label === label);
    assert.ok(node, `Missing field: ${label}`);
    return node.props;
  }
  function change(label, value) {
    const props = field(label);
    (props.onChangeText ?? props.onChange)(value);
  }
  async function press(label) {
    const node = find(render(), props => props.accessibilityLabel === label);
    assert.ok(node, `Missing control: ${label}`);
    assert.ok(!node.props.disabled, `Disabled control: ${label}`);
    await node.props.onPress();
  }
  render();
  effects.splice(0).forEach(fn => fn());
  await new Promise(resolve => setImmediate(resolve));
  return { render, find, field, change, press, paths, requests, updates, drafts };
}

for (const os of ['ios', 'android']) {
  test(`${os}: registration saves with all five personal fields blank`, async () => {
    const h = await screen({ os });
    for (const label of optionalFields) assert.equal(h.field(`${label} (optional)`).value, '');
    h.change('First name', 'Test');
    h.change('Surname', 'Player');
    await h.press('Continue to padel profile');
    h.change('Category', "Men's Intermediate");
    h.change('Home club', 'club-1');
    h.change('About your game', 'I enjoy padel.');
    h.change('Racket brand', 'Adidas');
    await h.press('I agree to the Terms and Privacy Policy');
    assert.ok(h.find(h.render(), props => Array.isArray(props.children) && props.children.join('') === 'Profile 100% complete'));
    await h.press('Save profile');
    assert.deepEqual(h.paths, ['/(tabs)']);
    const [name, payload] = h.requests[0];
    assert.equal(name, 'create_player_profile');
    for (const key of optionalKeys) assert.equal(payload[key], null, key);
    assert.equal(payload.p_name, 'Test Player');
    assert.equal(payload.p_email, 'player@example.com');
  });
}

test('first name and surname still validate before advancing', async () => {
  const h = await screen();
  await h.press('Continue');
  assert.equal(h.field('First name').error, 'Enter your first name.');
  assert.equal(h.field('Surname').error, 'Enter your surname.');
  for (const label of optionalFields) assert.equal(h.field(`${label} (optional)`).error, undefined);
  assert.equal(h.drafts.length, 0);
});

test('restored optional details can be removed before continuing', async () => {
  const h = await screen({ saved: {
    firstName: 'Test', lastName: 'Player', idNumber: 'ID123', contactNumber: '0123456789',
    gender: 'Female', nationality: 'South Africa', region: 'Gauteng',
  } });
  for (const label of optionalFields) {
    const name = `${label} (optional)`;
    assert.ok(h.field(name).value);
    if (h.field(name).options) {
      assert.ok(h.field(name).options.some(option => option.value === ''));
    }
    h.change(name, '');
  }
  await h.press('Continue to padel profile');
  for (const key of ['idNumber', 'contactNumber', 'gender', 'nationality', 'region']) {
    assert.equal(h.drafts[0][key], '');
  }
});

test('profile payload preserves supplied values and normalises whitespace-only details to null', async () => {
  for (const value of ['  ', ' Supplied value ']) {
    const h = await screen();
    h.change('First name', 'Test');
    h.change('Surname', 'Player');
    for (const label of optionalFields) h.change(`${label} (optional)`, value);
    await h.press('Continue to padel profile');
    h.change('Category', "Men's Intermediate");
    h.change('Home club', 'club-1');
    h.change('About your game', 'I enjoy padel.');
    h.change('Racket brand', 'Adidas');
    await h.press('I agree to the Terms and Privacy Policy');
    await h.press('Save profile');
    for (const key of optionalKeys) assert.equal(h.requests[0][1][key], value.trim() || null);
  }
});

test('editing another profile detail does not require a mobile number or region', async () => {
  const h = await screen({ edit: true });
  h.change('About your game', 'Updated padel bio.');
  await h.press('Save changes');
  assert.equal(h.updates.length, 1);
  assert.equal(h.updates[0].contact_number, null);
  assert.equal(h.updates[0].region, null);
  assert.equal(h.updates[0].bio, 'Updated padel bio.');
  assert.deepEqual(h.paths, ['back']);
});
