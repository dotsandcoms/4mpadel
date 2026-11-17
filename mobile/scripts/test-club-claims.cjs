const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;

function load(file, dependencies = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { fileName: file, compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: name => name === 'react' ? React : name === 'react/jsx-runtime' ? require(name) : dependencies[name] || {}, console, Promise, URL, AbortController });
  return module.exports;
}
const account = { id: 'account-a', email: 'a_b@example.test' };
const club = { id: 'club-a', slug: 'club-a', name: 'Test Club', city: 'Cape Town', approved: false };
const form = { name: ' Claimant ', phone: ' +27 82 123 4567 ', role: 'Owner', notes: ' A connection to the club ' };
function fixture(options = {}) {
  let user = { ...account }, pending = !!options.pending;
  const calls = [], emails = [];
  const supabase = {
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
      getSession: async () => ({ data: { session: { user, access_token: 'fake-own-session' } } }),
    },
    functions: { invoke: async (name, request) => { emails.push({ name, ...request }); return options.emailFailure ? { error: new Error('Delivery failed') } : { data: { messageId: 'fake' } }; } },
    from(table) {
      const call = { table, filters: [] }; calls.push(call);
      return {
        select(fields, settings) { call.fields = fields; call.settings = settings; return this; },
        eq(key, value) { call.filters.push([key, value]); return this; },
        ilike(key, value) { call.filters.push([key, value]); return this; },
        limit(value) { call.limit = value; return this; },
        abortSignal(signal) { call.signal = signal; return this; },
        maybeSingle() { return this; },
        insert(payload) { call.insert = payload; return this; },
        then(resolve, reject) {
          let response;
          if (call.insert) { response = { error: options.insertError || null }; pending = !response.error; }
          else if (table === 'players') response = { data: options.noProfile ? null : { id: 7, name: 'Player', contact_number: '0821234567' } };
          else if (table === 'club_claim_requests') response = { data: pending ? [{ id: 'existing' }] : [] };
          else response = { count: options.ownershipFailure ? null : options.hasOwner ? 1 : 0 };
          return Promise.resolve(response).then(resolve, reject);
        },
      };
    },
  };
  const api = load('src/lib/club-claims.ts', { './supabase': { supabase }, './clubs': { fetchClub: async () => club } });
  return { ...api, calls, emails, switchAccount() { user = { id: 'other', email: 'other@example.test' }; } };
}
test('a native claim uses the signed-in player and the existing pending-review queue and email templates', async () => {
  const f = fixture();
  const result = await f.submitClubClaim(club.slug, account, form);
  assert.equal(result.emailsSent, true);
  const writes = f.calls.filter(call => call.insert);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].table, 'club_claim_requests');
  assert.deepEqual(JSON.parse(JSON.stringify(writes[0].insert)), {
    club_id: club.id, requester_player_id: 7, requester_email: account.email,
    full_name: 'Claimant', contact_phone: '+27 82 123 4567', primary_role: 'Owner', notes: 'A connection to the club', status: 'pending',
  });
  assert(f.calls.some(call => call.table === 'players' && call.filters.some(([key, value]) => key === 'email' && value === 'a\\_b@example.test')));
  assert.deepEqual(f.emails.map(call => call.body.template), ['club_claim_applied', 'admin_club_claim_applied']);
  assert.deepEqual(f.emails.map(call => call.body.to), [account.email, 'markstillerman@gmail.com']);
  assert(f.emails.every(call => call.headers.Authorization === 'Bearer fake-own-session'));
  assert(!f.calls.some(call => ['clubs', 'club_members'].includes(call.table)), 'claim submission must not grant ownership');
});
test('pending requests, including a concurrent duplicate, never send duplicate emails', async () => {
  for (const options of [{ pending: true }, { insertError: { code: '23505' } }]) {
    const f = fixture(options), result = await f.submitClubClaim(club.slug, account, form);
    assert.equal(result.alreadyPending, true); assert.equal(f.emails.length, 0);
  }
});
test('existing owners, unknown ownership, changed accounts and missing player profiles cannot submit a claim', async () => {
  for (const options of [{ hasOwner: true }, { ownershipFailure: true }, { noProfile: true }, { changedAccount: true }]) {
    const f = fixture(options); if (options.changedAccount) f.switchAccount();
    await assert.rejects(f.submitClubClaim(club.slug, account, form));
    assert.equal(f.calls.filter(call => call.insert).length, 0); assert.equal(f.emails.length, 0);
  }
});
test('a failed request sends no emails and a delivery failure still preserves the submitted request', async () => {
  const failed = fixture({ insertError: { code: '42501' } });
  await assert.rejects(failed.submitClubClaim(club.slug, account, form), /couldn’t be submitted/);
  assert.equal(failed.emails.length, 0);
  const delivered = fixture({ emailFailure: true });
  assert.equal((await delivered.submitClubClaim(club.slug, account, form)).emailsSent, false);
  assert.equal((await delivered.submitClubClaim(club.slug, account, form)).alreadyPending, true);
  assert.equal(delivered.emails.length, 2);
});
const native = Object.fromEntries(['ActivityIndicator', 'KeyboardAvoidingView', 'ScrollView', 'Text', 'View', 'Pressable'].map(name => [name, name]));
native.StyleSheet = { create: value => value }; native.Platform = { OS: 'ios' };
const settle = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setTimeout(resolve, 0)); };
test('the native form reviews details before submission, prevents double taps and clears when accounts change', async () => {
  let receive, submitted = 0, release, renderer;
  const f = fixture();
  const screen = load('src/app/claim-club.tsx', {
    'react-native': native, 'expo-router': { Stack: { Screen: 'Screen' }, useLocalSearchParams: () => ({ slug: club.slug }), useRouter: () => ({ back() {}, push() {} }) },
    '@/lib/supabase': { supabase: { auth: { getSession: async () => ({ data: { session: { user: account } } }), onAuthStateChange(fn) { receive = fn; return { data: { subscription: { unsubscribe() {} } } }; } } } },
    '@/lib/club-claims': { ...f, fetchClubClaimContext: async () => ({ club, playerId: 7, name: 'Player', phone: '', pending: false, hasOwner: false }), submitClubClaim: async () => { submitted++; return new Promise(resolve => { release = resolve; }); } },
    '@/components/club-identity': { ClubIdentity: 'Identity' }, '@/components/home-action': { HomeAction: 'Action' },
    '@/components/liquid-field': { LiquidField: 'Field' }, '@/components/select-field': { SelectField: 'Select' }, '@/theme/tokens': { lightBrand: {} },
  });
  try {
    await act(async () => { renderer = create(React.createElement(screen.default)); await settle(); });
    await act(async () => renderer.root.findByProps({ label: 'Review club claim' }).props.onPress());
    assert.equal(renderer.root.findByProps({ label: 'Phone / WhatsApp' }).props.invalid, true);
    await act(async () => { renderer.root.findByProps({ label: 'Phone / WhatsApp' }).props.onChangeText('0821234567'); renderer.root.findByProps({ label: 'Your role at the club' }).props.onChange('Owner'); });
    await act(async () => renderer.root.findByProps({ label: 'Review club claim' }).props.onPress());
    assert.equal(submitted, 0);
    const submit = renderer.root.findByProps({ label: 'Submit club claim' }).props.onPress;
    await act(async () => { submit(); submit(); await settle(); });
    assert.equal(submitted, 1);
    await act(async () => { receive('SIGNED_OUT', null); release({ alreadyPending: false, emailsSent: true }); await settle(); });
    assert.equal(renderer.root.findAllByProps({ label: 'Back to club' }).length, 0);
    assert.equal(renderer.root.findByProps({ label: 'Sign in' }).type, 'Action');
  } finally { if (renderer) await act(async () => renderer.unmount()); }
});
test('club tags only show recorded approvals and public group membership, with an accessible group action', async () => {
  const components = load('src/components/club-tags.tsx', { 'react-native': native, 'expo-symbols': { SymbolView: 'Symbol' }, '@/theme/tokens': { lightBrand: {} } });
  let renderer, opened = 0;
  try {
    await act(async () => { renderer = create(React.createElement(components.ClubTags, { club, onGroup: () => opened++ })); });
    assert.equal(renderer.root.findAllByType('Text').length, 0);
    await act(async () => renderer.update(React.createElement(components.ClubTags, { club: { ...club, approved: true, sapaRegistered: true, clubType: 'Padel Club', group: { name: 'Net Set Padel', shortName: 'Net Set' } }, onGroup: () => opened++ })));
    assert(renderer.root.findAllByType('Text').some(node => node.children.join('') === '4M Approved'));
    assert(renderer.root.findAllByType('Text').some(node => node.children.join('') === 'SAPA'));
    renderer.root.findByProps({ accessibilityLabel: 'Part of Net Set Padel. View club group' }).props.onPress();
    assert.equal(opened, 1);
    const taggedClub = { ...club, approved: true, sapaRegistered: true, clubType: 'Padel Club', group: { name: 'Net Set Padel', shortName: 'Net Set' } };
    await act(async () => renderer.update(React.createElement(components.ClubTags, { club: taggedClub, compact: true })));
    assert.equal(renderer.root.findAllByType('Pressable').length, 0, 'tags inside a club card must not introduce nested buttons');
    assert(renderer.root.findAllByType('Text').some(node => node.children.join('') === '4M Approved'));
    assert.equal(components.clubTagsDescription(taggedClub), '4M Approved. SAPA. Padel Club. Part of Net Set');
    assert.equal(components.clubTagsDescription(club), '');
  } finally { if (renderer) await act(async () => renderer.unmount()); }
});
