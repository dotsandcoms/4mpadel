const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const modules = Promise.all([
  import('../supabase/functions/delete-account/handler.mjs'),
  import('../supabase/functions/delete-account/apple.mjs'),
]);
const user = { id: 'verified-user', email: 'verified@example.invalid', identities: [] };
function serverHarness({ identity = user, authError = null, objects = [], storageError = null,
  deleteError = null, revokeError = null } = {}) {
  const calls = [];
  return { calls, dependencies: {
    admin: {
      auth: { getUser: async token => { calls.push(['auth', token]); return { data: { user: identity }, error: authError }; } },
      rpc: async (name, args) => {
        calls.push([name, args]);
        return name === 'account_deletion_storage' ? { data: objects, error: null } : { data: !deleteError, error: deleteError };
      },
      storage: { from: bucket => ({ remove: async names => { calls.push(['photos', bucket, names]); return { error: storageError }; } }) },
    },
    revokeApple: async (...args) => { calls.push(['apple', ...args]); if (revokeError) throw revokeError; },
  } };
}
async function request(h, body = { confirmation: 'DELETE' }, authorization = 'Bearer session', method = 'POST') {
  const [{ createDeletionHandler }] = await modules;
  return createDeletionHandler(h.dependencies)(new Request('https://example.invalid/delete-account', {
    method, headers: authorization ? { authorization } : {}, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}),
  }));
}
test('rejects missing/invalid auth and forged deletion targets before any mutation', async () => {
  for (const [body, authorization, status] of [
    [{ confirmation: 'DELETE' }, null, 401], [{}, 'Bearer session', 400],
    [{ confirmation: 'DELETE', userId: 'victim' }, 'Bearer session', 400],
    [{ confirmation: 'DELETE', email: 'victim@example.invalid' }, 'Bearer session', 400],
  ]) {
    const h = serverHarness(); assert.equal((await request(h, body, authorization)).status, status);
    assert.equal(h.calls.length, 0);
  }
  const h = serverHarness({ identity: null, authError: new Error('expired') });
  assert.equal((await request(h)).status, 401); assert.equal(h.calls.length, 1);
});
test('deletes only the verified user, removes photos in bounded batches, then commits', async () => {
  const h = serverHarness({ objects: Array.from({ length: 203 }, (_, i) => ({ bucket: 'profile-pics', name: `42/photo-${i}.jpg` })) });
  const response = await request(h);
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { deleted: true });
  assert.deepEqual(h.calls.filter(c => c[0] === 'photos').map(c => c[2].length), [100, 100, 3]);
  assert.deepEqual(h.calls.at(-1), ['complete_account_deletion', { p_user_id: user.id }]);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});
test('photo failure never removes the account; errors do not disclose provider/database details', async () => {
  const h = serverHarness({ objects: [{ bucket: 'profile-pics', name: '42/a.jpg' }], storageError: new Error('private details') });
  const response = await request(h);
  assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: 'DELETION_FAILED' });
  assert.equal(h.calls.some(c => c[0] === 'complete_account_deletion'), false);
});
test('Apple users require reauthentication and successful revocation before removal', async () => {
  const identity = { ...user, identities: [{ provider: 'apple', identity_data: { sub: 'apple-user' } }] };
  const h = serverHarness({ identity });
  assert.equal((await request(h)).status, 400);
  assert.equal(h.calls.some(c => c[0] === 'account_deletion_storage'), false);
  const failing = serverHarness({ identity, revokeError: new Error('APPLE_REVOCATION_NOT_CONFIGURED') });
  const response = await request(failing, { confirmation: 'DELETE', appleAuthorizationCode: 'fresh-code' });
  assert.deepEqual(await response.json(), { error: 'APPLE_REVOCATION_NOT_CONFIGURED' });
  assert.equal(failing.calls.some(c => c[0] === 'account_deletion_storage'), false);
  const valid = serverHarness({ identity });
  assert.equal((await request(valid, { confirmation: 'DELETE', appleAuthorizationCode: 'fresh-code' })).status, 200);
  assert.deepEqual(valid.calls[1], ['apple', 'fresh-code', 'apple-user']);
});
test('provider revocation validates Apple subject and uses a refresh token', async () => {
  const [, { revokeAppleAuthorization }] = await modules;
  const calls = [];
  const idToken = sub => `header.${Buffer.from(JSON.stringify({ sub, iss: 'https://appleid.apple.com', aud: 'com.fourmpadel.app' })).toString('base64url')}.signature`;
  const env = name => name === 'APPLE_CLIENT_SECRET' ? 'server-only-secret' : undefined;
  const send = async (url, options) => {
    calls.push([url, Object.fromEntries(options.body)]);
    return url.endsWith('/token') ? Response.json({ id_token: idToken('linked-user'), refresh_token: 'refresh' }) : new Response('');
  };
  await revokeAppleAuthorization('fresh-code', 'linked-user', env, send);
  assert.equal(calls[1][0], 'https://appleid.apple.com/auth/revoke');
  assert.equal(calls[1][1].token_type_hint, 'refresh_token');
  calls.length = 0;
  await assert.rejects(revokeAppleAuthorization('fresh-code', 'another-user', env, send), /APPLE_IDENTITY_MISMATCH/);
  assert.equal(calls.length, 1);
  await assert.rejects(revokeAppleAuthorization('code', 'user', () => undefined, send), /APPLE_REVOCATION_NOT_CONFIGURED/);
});
test('server Apple client secret is a signed, short-lived ES256 token', async () => {
  const [, { revokeAppleAuthorization }] = await modules;
  const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey('pkcs8', keys.privateKey)).toString('base64')}\n-----END PRIVATE KEY-----`;
  const vars = { APPLE_PRIVATE_KEY: pem, APPLE_TEAM_ID: 'TEAM', APPLE_KEY_ID: 'KEY' };
  await assert.rejects(revokeAppleAuthorization('code', 'subject', name => vars[name], async (url, options) => {
    const jwt = options.body.get('client_secret'), [header, payload, signature] = jwt.split('.');
    const claims = JSON.parse(Buffer.from(payload, 'base64url'));
    assert.equal(claims.exp - claims.iat, 300); assert.equal(claims.sub, 'com.fourmpadel.app');
    assert.equal(JSON.parse(Buffer.from(header, 'base64url')).kid, 'KEY');
    assert.equal(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, keys.publicKey,
      Buffer.from(signature, 'base64url'), new TextEncoder().encode(`${header}.${payload}`)), true);
    return new Response('', { status: 400 });
  }), /APPLE_TOKEN_EXCHANGE_FAILED/);
});
class AuthCancelled extends Error {}
function clientHarness({ apple = false, canceled = false, wrongApple = false, serverError = null, draftError = false } = {}) {
  const calls = [], exports = {};
  const supabase = {
    auth: {
      getUser: async () => ({ data: { user: { ...user, identities: apple ? [{ provider: 'apple', identity_data: { sub: 'linked' } }] : [] } }, error: null }),
      signOut: async options => { calls.push(['signOut', options]); return { error: null }; },
    },
    functions: { invoke: async (name, args) => { calls.push(['invoke', name, args]); return { data: { deleted: !serverError }, error: serverError }; } },
  };
  const dependencies = {
    './analytics': { clearAccountAnalytics: async () => {} },
    './supabase': { supabase }, './auth': { AuthCancelled }, 'react-native': { Platform: { OS: 'ios' } },
    './profile-draft-storage': { clearDraftText: async email => { calls.push(['draft', email]); if (draftError) throw new Error('storage unavailable'); } },
    './companion': { setCompanionAccount: async id => calls.push(['watch', id]) },
    '@react-native-google-signin/google-signin': { GoogleSignin: { signOut: async () => calls.push(['google']) } },
    'expo-image': { Image: { clearMemoryCache: async () => calls.push(['memory']), clearDiskCache: async () => calls.push(['disk']) } },
    'expo-apple-authentication': { signInAsync: async () => {
      calls.push(['apple']); if (canceled) throw { code: 'ERR_REQUEST_CANCELED' };
      return { user: wrongApple ? 'wrong' : 'linked', authorizationCode: 'fresh-code' };
    } },
  };
  const source = ts.transpileModule(fs.readFileSync('src/lib/account-deletion.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(source, { exports, require: name => dependencies[name], Promise, Error });
  return { ...exports, calls };
}
test('successful client deletion clears phone/Watch data and session only after server confirmation', async () => {
  const h = clientHarness(); await h.deleteCurrentAccount();
  assert.deepEqual(h.calls.map(c => c[0]), ['draft', 'invoke', 'watch', 'google', 'signOut', 'memory', 'disk']);
  assert.equal(h.calls.find(c => c[0] === 'watch')[1], null);
  assert.equal(h.calls.find(c => c[0] === 'signOut')[1].scope, 'local');
});
test('server or draft failure keeps the signed-in account and Watch available for retry', async () => {
  for (const config of [{ serverError: new Error('offline') }, { draftError: true }]) {
    const h = clientHarness(config); await assert.rejects(h.deleteCurrentAccount());
    assert.equal(h.calls.some(c => c[0] === 'watch' || c[0] === 'signOut'), false);
    if (config.draftError) assert.equal(h.calls.some(c => c[0] === 'invoke'), false);
  }
});
test('canceling Apple confirmation or choosing another Apple ID never starts deletion', async () => {
  for (const config of [{ canceled: true }, { wrongApple: true }]) {
    const h = clientHarness({ apple: true, ...config }); await assert.rejects(h.deleteCurrentAccount());
    assert.deepEqual(h.calls, [['apple']]);
  }
  const h = clientHarness({ apple: true }); await h.deleteCurrentAccount();
  assert.equal(h.calls.find(c => c[0] === 'invoke')[2].body.appleAuthorizationCode, 'fresh-code');
});
