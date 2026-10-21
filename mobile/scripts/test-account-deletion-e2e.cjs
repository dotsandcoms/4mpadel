// Server-only integration test. Creates and deletes its own uniquely named fixture.
// Never run this with public/client bundles; it requires a server service-role key.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
function readEnv(path) {
  return Object.fromEntries(fs.readFileSync(path, 'utf8').split('\n').flatMap(line => {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    return match ? [[match[1], match[2].trim().replace(/^(["'])(.*)\1$/, '$2')]] : [];
  }));
}
async function main() {
  const clientEnv = readEnv('.env'), serverEnv = readEnv(process.argv[2]);
  const url = clientEnv.EXPO_PUBLIC_SUPABASE_URL;
  assert.equal(new URL(url).hostname, 'uzglrpbixubfijvjbtgz.supabase.co');
  const key = serverEnv.SUPABASE_SERVICE_ROLE_KEY || serverEnv.VITE_SUPABASE_SERVICE_ROLE_KEY;
  assert.ok(key, 'Server credential required');
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(url, key, options);
  const client = createClient(url, clientEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY, options);
  const email = `account-deletion-e2e-${randomUUID()}@example.invalid`;
  const password = `Fixture@${randomUUID()}`;
  let fixtureUser, fixturePlayer, deleted = false;
  try {
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true,
      user_metadata: { account_deletion_test: true } });
    if (created.error) throw new Error('Unable to create disposable Auth fixture');
    fixtureUser = created.data.user.id;
    const player = await admin.from('players').insert({ name: 'Account deletion test', email, approved: false }).select('id').single();
    if (player.error) throw new Error('Unable to create disposable profile fixture');
    fixturePlayer = player.data.id;
    const photo = await admin.storage.from('profile-pics').upload(`${fixturePlayer}/deletion-test.png`,
      Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64'),
      { contentType: 'image/png' });
    if (photo.error) throw new Error('Unable to upload disposable photo fixture');
    const signedIn = await client.auth.signInWithPassword({ email, password });
    if (signedIn.error) throw new Error('Fixture sign-in failed');
    const before = await client.from('players').select('id').eq('id', fixturePlayer);
    assert.equal(before.data?.length, 1, 'Active-account RLS allows the own profile');
    const result = await client.functions.invoke('delete-account', { body: { confirmation: 'DELETE' } });
    if (result.error || result.data?.deleted !== true) {
      // Keep diagnostics free of tokens, account identifiers and server credentials.
      throw new Error(`Deletion endpoint failed (HTTP ${result.error?.context?.status || 'unknown'})`);
    }
    deleted = true;
    const absent = await admin.auth.admin.getUserById(fixtureUser);
    assert.ok(absent.error, 'Auth account was removed');
    const profile = await admin.from('players').select('id').eq('id', fixturePlayer);
    assert.equal(profile.data?.length, 0, 'Profile was removed');
    const files = await admin.storage.from('profile-pics').list(String(fixturePlayer));
    assert.equal(files.data?.length, 0, 'Photos were removed via Storage API');
    const stale = await client.from('players').select('id').limit(1);
    assert.equal(stale.data?.length, 0, 'Deleted-account JWT cannot read through RLS');
    const login = await client.auth.signInWithPassword({ email, password });
    assert.ok(login.error, 'Removed account cannot sign in');
    console.log('PASS: live endpoint verified Auth deletion, profile deletion, Storage removal, stale-JWT denial and blocked re-login using only a disposable fixture.');
  } finally {
    if (!deleted && fixtureUser) {
      if (fixturePlayer) {
        const objects = await admin.storage.from('profile-pics').list(String(fixturePlayer));
        if (objects.data?.length) await admin.storage.from('profile-pics').remove(objects.data.map(o => `${fixturePlayer}/${o.name}`));
      }
      // The target is exclusively the ID returned by this test's createUser call.
      await admin.rpc('complete_account_deletion', { p_user_id: fixtureUser });
    }
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
