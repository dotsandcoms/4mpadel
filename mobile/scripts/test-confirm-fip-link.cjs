const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function setup({ localName = 'Mark Stillerman', sourceName = 'Mark Stillerman', existing = null, userEmail = 'mark@example.com', official = true } = {}) {
  let handler, written = null;
  const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service', PADEL_API_TOKEN: 'token' };
  const user = { id: 'user-1', email: userEmail };
  const local = { id: 7, name: localName, email: 'mark@example.com', category: 'Men' };
  const admin = { from(table) {
    const builder = {
      select() { return this; }, eq() { return this; },
      maybeSingle: async () => ({ data: table === 'players' ? local : existing, error: null }),
      update(value) { written = value; return this; },
      insert(value) { written = value; return this; },
      single: async () => ({ data: { local_player_id: 7 }, error: null }),
    };
    return builder;
  } };
  const createClient = (_url, key) => key === 'service' ? admin : { auth: { getUser: async () => ({ data: { user }, error: null }) } };
  const fetch = async url => {
    if (String(url).includes('padelfip.com')) return new Response(official ? `<title>${sourceName} Official Profile 2026 | Padel FIP</title><span class="player__number"></span>` : '<title>Not a profile</title>', { headers: { 'content-type': 'text/html' } });
    return Response.json({ id: 725, name: sourceName, category: 'men', ranking: 725, points: 10 });
  };
  const code = ts.transpileModule(fs.readFileSync('supabase/functions/confirm-fip-link/index.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { require: () => ({ createClient }), module: { exports: {} }, exports: {}, Deno: { env: { get: key => env[key] }, serve: fn => { handler = fn; } }, Response, URL, AbortSignal, fetch, Date, Number });
  return { invoke: async body => { const response = await handler({ method: 'POST', headers: new Headers({ authorization: 'Bearer jwt' }), json: async () => body }); return { status: response.status, body: await response.json() }; }, written: () => written };
}

test('matching official record is confirmed server-side', async () => {
  const app = setup();
  const result = await app.invoke({ localPlayerId: 7, fipProfileUrl: 'https://www.padelfip.com/player/mark-stillerman/' });
  assert.equal(result.status, 200);
  assert.equal(app.written().status, 'verified');
  assert.equal(app.written().fip_rank, null);
  assert.ok(app.written().verified_at);
});

test('a different player name cannot be auto-verified', async () => {
  const app = setup({ sourceName: 'Another Player' });
  const result = await app.invoke({ localPlayerId: 7, fipPlayerId: 725 });
  assert.equal(result.status, 422);
  assert.equal(app.written(), null);
});

test('the account must own the local player profile', async () => {
  const app = setup({ userEmail: 'someone@example.com' });
  const result = await app.invoke({ localPlayerId: 7, fipPlayerId: 725 });
  assert.equal(result.status, 403);
  assert.equal(app.written(), null);
});

test('an old pending link can be confirmed after the official source is checked', async () => {
  const app = setup({ existing: { fip_player_id: null, fip_profile_url: 'https://www.padelfip.com/player/mark-stillerman/', fip_category: 'men', status: 'pending' } });
  const result = await app.invoke({ localPlayerId: 7 });
  assert.equal(result.status, 200);
  assert.equal(app.written().status, 'verified');
});
