const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function appleAuth({ email, userId = 'original-account', linkError = null }) {
  const calls = [];
  const credential = { email, identityToken: 'apple-token', fullName: null };
  const dependencies = {
    'react-native': { Platform: { OS: 'ios' } },
    '@react-native-google-signin/google-signin': { GoogleSignin: { configure() {} } },
    'expo-apple-authentication': {
      AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
      signInAsync: async options => { calls.push(['apple', options.nonce]); return credential; },
    },
    'expo-crypto': {
      randomUUID: () => 'raw-nonce',
      CryptoDigestAlgorithm: { SHA256: 'SHA256' },
      digestStringAsync: async (_algorithm, value) => 'hashed-' + value,
    },
    './analytics': { trackEvent() {} },
    './signup-source': { recordAppDevice() {} },
    './supabase': {
      supabase: { auth: {
        getUser: async () => ({ data: { user: { id: userId } }, error: null }),
        signInWithIdToken: async options => { calls.push(['sign-in', options]); return { data: { user: null }, error: null }; },
        linkIdentity: async options => { calls.push(['link', options]); return { error: linkError }; },
      } },
    },
  };
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/auth.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    module: mod, exports: mod.exports, require: name => dependencies[name] ?? {}, process,
  });
  return { ...mod.exports, calls };
}

test('first-time Apple relay users can stop before creating a second Auth account', async () => {
  const h = appleAuth({ email: 'relay@privaterelay.appleid.com' });
  await assert.rejects(h.signInWithApple(async () => false), h.AuthCancelled);
  assert.deepEqual(h.calls.map(call => call[0]), ['apple']);
  await h.signInWithApple(async () => true);
  assert.deepEqual(h.calls.map(call => call[0]), ['apple', 'apple', 'sign-in']);
});

test('Apple with a regular email and returning Apple credentials skip the account prompt', async () => {
  for (const email of ['player@example.test', null]) {
    const h = appleAuth({ email });
    await h.signInWithApple(async () => assert.fail('Unexpected prompt'));
    assert.deepEqual(h.calls.map(call => call[0]), ['apple', 'sign-in']);
  }
});

test('Apple is linked to the signed-in account with the nonce-bound identity token', async () => {
  const h = appleAuth({ email: null });
  await h.linkAppleToAccount('original-account');
  assert.equal(h.calls[0][1], 'hashed-raw-nonce');
  assert.equal(h.calls[1][0], 'link');
  assert.equal(h.calls[1][1].provider, 'apple');
  assert.equal(h.calls[1][1].nonce, 'raw-nonce');
  assert.equal(h.calls[1][1].token, 'apple-token');
});

test('Apple linking never signs into a second account if the existing session changes or linking conflicts', async () => {
  const changed = appleAuth({ email: null, userId: 'different-account' });
  await assert.rejects(changed.linkAppleToAccount('original-account'), /Sign in to your 4M Padel account/);
  assert.deepEqual(changed.calls.map(call => call[0]), ['apple']);
  const conflict = appleAuth({ email: null, linkError: new Error('identity_already_exists') });
  await assert.rejects(conflict.linkAppleToAccount('original-account'), /identity_already_exists/);
  assert.deepEqual(conflict.calls.map(call => call[0]), ['apple', 'link']);
});

function profileLookup(result) {
  const queries = [];
  const query = {
    select: columns => { queries.push(['select', columns]); return query; },
    ilike: (column, value) => { queries.push(['ilike', column, value]); return query; },
    maybeSingle: async () => {
      if (result instanceof Error) throw result;
      return result;
    },
  };
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/profile.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    module: mod, exports: mod.exports,
    require: name => name === './supabase'
      ? { supabase: { from: table => { assert.equal(table, 'players'); return query; } } }
      : {},
  });
  return { ...mod.exports, queries };
}

const session = { user: { id: 'returning-player', email: 'player@example.com' } };

test('existing players go home even when their mobile number or other details are missing', async () => {
  for (const row of [
    { id: 407, name: 'Returning Player', contact_number: null, gender: 'Male', region: 'Western Cape' },
    { id: 408, name: null, contact_number: null, gender: null, region: null },
  ]) {
    const h = profileLookup({ data: row, error: null });
    assert.equal(await h.destinationAfterAuth(session), '/(tabs)');
    // A new login/startup performs the same server check and still goes home.
    assert.equal(await h.destinationAfterAuth(session), '/(tabs)');
  }
});

test('a confirmed missing player still starts profile setup', async () => {
  const h = profileLookup({ data: null, error: null });
  assert.equal(await h.destinationAfterAuth(session), '/(auth)/complete-profile');
});

test('database and duplicate-row errors never send an existing account to signup', async () => {
  for (const code of ['42501', 'PGRST116', '503']) {
    const h = profileLookup({ data: null, error: { code, message: 'Lookup failed' } });
    await assert.rejects(h.destinationAfterAuth(session), /load your player profile/i);
  }
});

test('a network failure propagates without returning a setup destination', async () => {
  const h = profileLookup(new Error('Network unavailable'));
  await assert.rejects(h.destinationAfterAuth(session), /Network unavailable/);
});

test('signed-out accounts go to sign-in without querying player data', async () => {
  const h = profileLookup({ data: null, error: null });
  assert.equal(await h.destinationAfterAuth(null), '/(auth)/sign-in');
  assert.deepEqual(h.queries, []);
});

test('profile lookup trims the account email and treats pattern characters literally', async () => {
  const h = profileLookup({ data: { id: 409 }, error: null });
  assert.equal(await h.hasPlayerProfile('  Player_100%@Example.com  '), true);
  assert.deepEqual(h.queries.find(([method]) => method === 'ilike'), ['ilike', 'email', 'Player\\_100\\%@Example.com']);
});

test('an absent email does not query player data', async () => {
  const h = profileLookup({ data: null, error: null });
  assert.equal(await h.hasPlayerProfile(undefined), false);
  assert.equal(await h.hasPlayerProfile('   '), false);
  assert.deepEqual(h.queries, []);
});
