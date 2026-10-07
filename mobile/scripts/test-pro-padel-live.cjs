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
  const { parseProviderMatch, recentMatchForm } = load('src/lib/pro-padel-live.ts');
  const result = parseProviderMatch({ id: 13448, category: 'men', round: 8, round_name: 'Round of 16', status: 'finished',
    players: { team_1: [{ id: 1, name: 'First Player', nationality: 'ZA' }, { id: 2, name: 'Second Player' }], team_2: [{ id: 3, name: 'Third Player' }] },
    score: [{ team_1: '6', team_2: '4' }], winner: 'team_1', seeds: { team_1: '1', team_2: 'WC' }, watchability: 95, tournament: { id: 745, name: 'Rotterdam P2' } });
  assert.equal(result.match.tournamentName, 'Rotterdam P2');
  assert.equal(result.match.teams[0][0].name, 'First Player');
  assert.equal(result.match.teams[0][0].nationality, 'ZA');
  assert.equal(result.match.score[0][1], '4');
  assert.deepEqual(Array.from(recentMatchForm([result, { ...result, match: { ...result.match, id: 13449, winner: 'team_2' } }], 1)), [false, true]);
  assert.equal(result.watchability, 95);
  assert.equal(result.seeds[1], 'WC');
  assert.equal(parseProviderMatch({ id: 2, players: {} }), null);
});

test('live point feed supplies set and current game scores when match list score is empty', () => {
  const { liveScoreFromPointFeed } = load('src/lib/pro-padel-live.ts');
  const score = liveScoreFromPointFeed({ coverage: 'tracking', status: 'live', sets: [
    { set_number: 1, set_score: '3-6', games: [] },
    { set_number: 2, set_score: null, games: [{ game_number: 2, game_score: '1-0', serving: 'team_2', points: ['0:0', '15:30'] }] },
  ] });
  assert.deepEqual(Array.from(score.sets, set => Array.from(set)), [['3', '6'], ['1', '0']]);
  assert.equal(score.points, '15:30');
  assert.equal(score.serving, 'team_2');
});

test('player matches acquire flags from one multi-player lookup', async () => {
  let handler;
  const requests = [];
  load('supabase/functions/pro-padel-explore/index.ts', {
    Deno: { env: { get: key => key }, serve: fn => { handler = fn; } },
    require: () => ({ createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'flag-user' } } }) } }) }),
    fetch: async url => {
      const request = new URL(url); requests.push(request);
      if (request.pathname === '/api/players') return Response.json({ data: [{ id: 1, nationality: 'ZA' }, { id: 2, nationality: 'ES' }] });
      return Response.json({ data: [{ id: 40, players: { team_1: [{ id: 1, name: 'Richard Ashforth' }], team_2: [{ id: 2, name: 'Antonio Fernandez' }] }, connections: {} }], meta: { last_page: 1 } });
    },
  });
  const response = await handler({ method: 'POST', headers: new Headers(), json: async () => ({ kind: 'player-matches', id: 1 }) });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data[0].players.team_1[0].nationality, 'ZA');
  assert.equal(body.data[0].players.team_2[0].nationality, 'ES');
  assert.equal(requests.filter(request => request.pathname === '/api/players').length, 1);
});

test('tournament draw keeps results and enriches player flags', async () => {
  let handler;
  const requested = [];
  load('supabase/functions/pro-padel-explore/index.ts', {
    Deno: { env: { get: key => key }, serve: fn => { handler = fn; } },
    require: () => ({ createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'tour-user' } } }) } }) }),
    fetch: async url => {
      const path = new URL(url).pathname;
      requested.push(path);
      if (path === '/api/tournaments/746') return Response.json({ id: 746, name: 'Germany P2 2026', country: 'DE' });
      if (path === '/api/players') return Response.json({ data: [{ id: 11, nationality: 'ES' }, { id: 12, nationality: 'AR' }] });
      return Response.json({ data: [{ id: 100, status: 'finished', players: { team_1: [{ id: 11, name: 'One' }], team_2: [{ id: 12, name: 'Two' }] }, score: [{ team_1: 6, team_2: 4 }] }], meta: { total: 102, last_page: 3 } });
    },
  });
  const request = body => ({ method: 'POST', headers: new Headers(), json: async () => body });
  const detail = await (await handler(request({ kind: 'tournament', id: 746 }))).json();
  const draw = await (await handler(request({ kind: 'tournament-matches', id: 746, page: 1 }))).json();
  assert.equal(detail.country, 'DE');
  assert.equal(draw.meta.total, 102);
  assert.equal(draw.data[0].status, 'finished');
  assert.equal(draw.data[0].players.team_1[0].nationality, 'ES');
  assert.equal(draw.data[0].players.team_2[0].nationality, 'AR');
  assert.ok(requested.includes('/api/tournaments/746/matches'));
});

test('official FIP coach lookup is distinct from Padel API player data', async () => {
  let handler;
  load('supabase/functions/pro-padel-explore/index.ts', {
    Deno: { env: { get: key => key }, serve: fn => { handler = fn; } },
    require: () => ({ createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'coach-user' } } }) } }) }),
    fetch: async url => {
      if (String(url).includes('padelapi.org')) return Response.json({ id: 1736, name: 'Richard Ashforth' });
      const response = new Response('<title>Richard Ashforth Official Profile 2026 | Padel FIP</title><span class="overview__title">Coaches</span><div class="overview__coaches"><p class="overview__text">Gregg Lee</p></div>');
      Object.defineProperty(response, 'url', { value: 'https://www.padelfip.com/player/richard-ashforth/' });
      return response;
    },
  });
  const response = await handler({ method: 'POST', headers: new Headers(), json: async () => ({ kind: 'player-coach', id: 1736 }) });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.coaches, ['Gregg Lee']);
  assert.equal(body.sourceUrl, 'https://www.padelfip.com/player/richard-ashforth/');
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

test('player history proxy requests the selected season with all draws', async () => {
  let handler, requested;
  load('supabase/functions/pro-padel-explore/index.ts', {
    Deno: { env: { get: key => key }, serve: fn => { handler = fn; } },
    require: () => ({ createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'profile-user' } } }) } }) }),
    fetch: async url => { requested = new URL(url); return Response.json({ data: [], meta: { last_page: 1, total: 0 } }); },
  });
  const request = body => ({ method: 'POST', headers: new Headers(), json: async () => body });
  assert.equal((await handler(request({ kind: 'player-matches', id: 45, year: 1900 }))).status, 400);
  assert.equal((await handler(request({ kind: 'player-matches', id: 45, year: 2026, page: 1 }))).status, 200);
  assert.equal(requested.pathname, '/api/players/45/matches');
  assert.equal(requested.searchParams.get('draw'), 'all');
  assert.equal(requested.searchParams.get('after_date'), '2026-01-01');
  assert.equal(requested.searchParams.get('before_date'), '2026-12-31');
});

test('player matches include the linked tournament name without losing a result', async () => {
  let handler;
  load('supabase/functions/pro-padel-explore/index.ts', {
    Deno: { env: { get: key => key }, serve: fn => { handler = fn; } },
    require: () => ({ createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'profile-user' } } }) } }) }),
    fetch: async url => String(url).includes('/tournaments/840')
      ? Response.json({ id: 840, name: 'FIP Silver Nairobi B-active' })
      : Response.json({ data: [{ id: 12615, connections: { tournament: '/api/tournaments/840' } }], meta: { last_page: 1, total: 1 } }),
  });
  const response = await handler({ method: 'POST', headers: new Headers(), json: async () => ({ kind: 'player-matches', id: 1736, year: 2026 }) });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data[0].tournament.name, 'FIP Silver Nairobi B-active');
});

test('pair routes validate IDs and expose stats and matches for the selected period', async () => {
  let handler, requested;
  load('supabase/functions/pro-padel-explore/index.ts', {
    Deno: { env: { get: key => key }, serve: fn => { handler = fn; } },
    require: () => ({ createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'profile-user' } } }) } }) }),
    fetch: async url => { requested = new URL(url); return Response.json(requested.pathname.endsWith('/stats') ? { matches_played: 4, matches_won: 1 } : { data: [], meta: { last_page: 1, total: 0 } }); },
  });
  const request = body => ({ method: 'POST', headers: new Headers(), json: async () => body });
  assert.equal((await handler(request({ kind: 'pair-stats', id: '../../secrets' }))).status, 400);
  assert.equal((await handler(request({ kind: 'pair-stats', id: '1736-1737' }))).status, 200);
  assert.equal(requested.pathname, '/api/pairs/1736-1737/stats');
  assert.equal((await handler(request({ kind: 'pair-matches', id: '1736-1737', year: 2026 }))).status, 200);
  assert.equal(requested.pathname, '/api/pairs/1736-1737/matches');
  assert.equal(requested.searchParams.get('after_date'), '2026-01-01');
  assert.equal(requested.searchParams.get('draw'), 'all');
});

test('player profile uses provider match history and career stats', async () => {
  const invoked = [];
  const { fetchPlayerProfile, fetchPlayerStats, fetchPlayerMatches, fetchPlayerPairs, fetchPairStats, fetchPairMatches, fetchPlayerRankings } = load('src/lib/pro-padel-live.ts', {
    require: () => ({ supabase: { functions: { invoke: async (_, { body }) => {
      invoked.push(body);
      if (body.kind === 'player') return { data: { id: 45, name: 'Richard Ashforth', category: 'men', ranking: '461', points: 65, nationality: 'ZA', birthdate: '1994-09-02' } };
      if (body.kind === 'player-stats') return { data: { matches_played: 4, matches_won: 1, win_percentage: 25, titles: 0, finals: 0, semifinals: 0, sets_won: 2, sets_lost: 6, coverage: 'full' } };
      if (body.kind === 'player-pairs') return { data: { data: [{ id: '45-46', name: 'Ashforth/Krige', status: 'current', points: 116, players: [{ id: 45, name: 'Richard Ashforth' }, { id: 46, name: 'Luan Krige', ranking: 538, points: 51, nationality: 'ZA' }], first_match_at: '2026-02-18', last_match_at: '2026-09-18' }], meta: { total: 1 } } };
      if (body.kind === 'pair-stats') return { data: { matches_played: 4, matches_won: 1, win_percentage: 25, sets_won: 2, sets_lost: 6, coverage: 'full' } };
      if (body.kind === 'player-rankings') return { data: [{ type: 'official', ranking: 461, points: 65, date: '2026-10-05' }] };
      return { data: { data: [{ id: 301, category: 'men', round: 8, status: 'finished', winner: 'team_2', played_at: '2026-09-18', score: [{ team_1: '7', team_2: '5' }, { team_1: '6', team_2: '0' }], tournament: { id: 9, name: 'FIP Silver Nairobi' }, players: { team_1: [{ id: 47, name: 'Fernandez' }, { id: 48, name: 'Del Castillo' }], team_2: [{ id: 45, name: 'Richard Ashforth' }, { id: 46, name: 'Luan Krige' }] } }], meta: { last_page: 1, total: 1 } } };
    } } } }),
  });
  const profile = await fetchPlayerProfile(45);
  const stats = await fetchPlayerStats(45);
  const matches = await fetchPlayerMatches(45, 1, 2026);
  const pairs = await fetchPlayerPairs(45);
  const pairStats = await fetchPairStats('45-46');
  const pairMatches = await fetchPairMatches('45-46', 1, 2026);
  const rankings = await fetchPlayerRankings(45);
  assert.equal(profile.rank, 461);
  assert.equal(stats.matchesWon, 1);
  assert.equal(matches.matches[0].match.tournamentName, 'FIP Silver Nairobi');
  assert.equal(matches.matches[0].scoreText, '7-5, 6-0');
  assert.equal(pairs[0].partner.name, 'Luan Krige');
  assert.equal(pairs[0].status, 'current');
  assert.equal(pairs[0].partnerRank, 538);
  assert.equal(pairs[0].combinedPoints, 116);
  assert.equal(pairStats.matchesPlayed, 4);
  assert.equal(pairMatches.matches[0].match.id, 301);
  assert.equal(rankings[0].rank, 461);
  assert.equal(invoked.find(call => call.kind === 'player-matches').year, 2026);
});
