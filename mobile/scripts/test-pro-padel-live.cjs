const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, overrides = {}) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module: mod, exports: mod.exports, require: () => ({}), Response, Headers, URL, AbortSignal, Map, Date, ...overrides });
  return mod.exports;
}

test('provider match mapping keeps teams, set scores and tournament identity', () => {
  const { parseProviderMatch } = load('src/lib/pro-padel-live.ts');
  const result = parseProviderMatch({ id: 13448, category: 'men', round: 8, round_name: 'Round of 16', status: 'finished',
    players: { team_1: [{ id: 1, name: 'First Player' }, { id: 2, name: 'Second Player' }], team_2: [{ id: 3, name: 'Third Player' }] },
    score: [{ team_1: '6', team_2: '4' }], winner: 'team_1', seeds: { team_1: '1', team_2: 'WC' }, watchability: 95, tournament: { id: 745, name: 'Rotterdam P2' } });
  assert.equal(result.match.tournamentName, 'Rotterdam P2');
  assert.equal(result.match.teams[0][0].name, 'First Player');
  assert.equal(result.match.score[0][1], '4');
  assert.equal(result.watchability, 95);
  assert.equal(result.seeds[1], 'WC');
  assert.equal(parseProviderMatch({ id: 2, players: {} }), null);
});

test('prediction proxy validates teams and returns only model probabilities', async () => {
  let handler, call;
  load('supabase/functions/pro-padel-explore/index.ts', {
    Deno: { env: { get: key => key }, serve: fn => { handler = fn; } },
    require: () => ({ createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'model-user' } } }) } }) }),
    fetch: async (url, options) => { call = { url: String(url), method: options.method, body: JSON.parse(options.body) }; return Response.json({ probability: { team_1: 56.44, team_2: 43.56 }, elo_diff: 23, players: { private: true } }); },
  });
  const request = body => ({ method: 'POST', headers: new Headers(), json: async () => body });
  assert.equal((await handler(request({ kind: 'prediction', id: 12294, team_1: [66, 66], team_2: [115, 114], played_at: '2026-09-13' }))).status, 400);
  const result = await handler(request({ kind: 'prediction', id: 12294, team_1: [66, 65], team_2: [115, 114], played_at: '2026-09-13' }));
  assert.equal(result.status, 200);
  assert.match(call.url, /\/matches\/simulate$/);
  assert.equal(call.method, 'POST');
  assert.deepEqual(call.body.team_1, [66, 65]);
  const body = await result.json();
  assert.equal(body.probability.team_1, 56.44);
  assert.equal(body.eloDiff, 23);
  assert.equal('players' in body, false);
});

test('missing deployed explorer reports unavailable coverage instead of a retryable feed error', async () => {
  const { fetchLiveMatches } = load('src/lib/pro-padel-live.ts', {
    require: () => ({ supabase: { functions: { invoke: async () => ({
      data: null,
      error: { context: new Response(JSON.stringify({ code: 'NOT_FOUND', message: 'Requested function was not found' }), { status: 404 }) },
    }) } } }),
  });
  await assert.rejects(fetchLiveMatches(), /Live international match coverage is not available yet/);
});

test('secure explorer rejects unauthenticated and invalid requests, caches repeat reads', async () => {
  let handler;
  let user = { id: 'user-1' };
  let calls = 0;
  load('supabase/functions/pro-padel-explore/index.ts', {
    Deno: { env: { get: key => key }, serve: fn => { handler = fn; } },
    require: () => ({ createClient: () => ({ auth: { getUser: async () => ({ data: { user } }) } }) }),
    fetch: async url => { calls++; assert.equal(new URL(url).hostname, 'padelapi.org'); return new Response(JSON.stringify({ data: [], meta: { last_page: 1 } })); },
  });
  const request = body => ({ method: 'POST', headers: new Headers(), json: async () => body });
  user = null;
  assert.equal((await handler(request({ kind: 'live' }))).status, 401);
  user = { id: 'user-1' };
  assert.equal((await handler(request({ kind: 'match', id: 'https://evil.example' }))).status, 400);
  assert.equal((await handler(request({ kind: 'tournament-matches', id: 1, page: 999 }))).status, 400);
  assert.equal((await handler(request({ kind: 'live' }))).status, 200);
  assert.equal((await handler(request({ kind: 'live' }))).status, 200);
  assert.equal(calls, 1);
});
