const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

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
