const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, overrides = {}) {
  const mod = { exports: {} };
  const originalRequire = overrides.require || (() => ({}));
  const requireFn = name => {
    if (name.includes('padel-api.')) return load('supabase/functions/_shared/padel-api.mjs', { fetch: overrides.fetch || fetch, crypto, TextEncoder, setTimeout });
    const dependency = originalRequire(name);
    return dependency.createClient ? { ...dependency, createClient: (...args) => {
      const client = dependency.createClient(...args);
      return { ...client, rpc: client.rpc || (async name => ({ data: name === 'claim_padel_request' ? { action: 'fetch', lease_id: 'test', request_id: 1 } : null, error: null })) };
    } } : dependency;
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module: mod, exports: mod.exports, require: () => ({}), Response, Request, Headers, URL, AbortSignal, Map, Date, ...overrides, require: requireFn });
  return mod.exports;
}

test('tournament details retain real venue, timezone and prize metadata without hidden plan values', () => {
  const { parseProviderTournament, parseProviderMatch } = load('src/lib/pro-padel-live.ts');
  const tournament = { id: 746, name: 'Germany P2', venue: { name: 'Castello', address: 'Düsseldorf, Germany' }, court_type: 'indoor', timezone: 'Europe/Berlin', prize: { amount: 264534, currency: 'EUR' }, photo_url: 'https://example.test/poster.webp' };
  const parsed = parseProviderTournament(tournament);
  assert.equal(parsed.address, 'Düsseldorf, Germany');
  assert.equal(parsed.timezone, 'Europe/Berlin');
  assert.equal(parsed.prize.amount, 264534);
  assert.equal(parseProviderTournament({ ...tournament, prize: { amount: 'hidden_free_plan', currency: 'EUR' } }).prize, null);
  assert.equal(parseProviderMatch({ id: 1, category: 'men', players: {}, tournament }).tournament.venue, 'Castello');
});

test('complete tournament draw loads all pages, deduplicates matches and retains qualifying matches', async () => {
  const calls = [];
  const row = (id, draw = 'main') => ({ id, category: 'men', draw, status: 'finished', players: {}, tournament: { id: 746, name: 'Germany P2' } });
  const { fetchTournamentDraw } = load('src/lib/pro-padel-live.ts', { require: () => ({ supabase: { functions: { invoke: async (_, { body }) => {
    calls.push(body.page);
    return { data: { data: body.page === 1 ? [row(1)] : body.page === 2 ? [row(1), row(2)] : [row(3, 'qualy')], meta: { total: 3, last_page: 3 } } };
  } } } }) });
  const draw = await fetchTournamentDraw(746);
  assert.deepEqual(Array.from(draw.matches, row => row.match.id), [1, 2, 3]);
  assert.equal(draw.matches[2].draw, 'qualy');
  assert.equal(draw.complete, true);
  assert.deepEqual(calls, [1, 2, 3]);
});

test('partial tournament draw never reports its totals as complete', async () => {
  const { fetchTournamentDraw } = load('src/lib/pro-padel-live.ts', { require: () => ({ supabase: { functions: { invoke: async (_, { body }) => body.page === 2
    ? { error: { context: Response.json({ error: 'Unavailable' }, { status: 503 }) } }
    : { data: { data: [{ id: 1, category: 'women', status: 'finished', players: {} }], meta: { total: 2, last_page: 2 } } } } } }) });
  const draw = await fetchTournamentDraw(746);
  assert.equal(draw.matches.length, 1);
  assert.equal(draw.complete, false);
  assert.equal(draw.total, 2);
});

test('tournament rounds separate qualifying stages from the main draw and follow bracket order', () => {
  const { tournamentRounds } = load('src/lib/pro-tournament.ts', { Intl });
  const row = (id, round, draw = 'main') => ({ draw, match: { id, round, roundName: draw === 'qualy' ? 'Qualy' : null, playedAt: '2026-10-06' } });
  const rounds = tournamentRounds([row(1, 1), row(2, 16), row(3, 4, 'qualy'), row(4, 16, 'qualy'), row(5, 8, 'qualy'), row(6, 8)]);
  assert.deepEqual(Array.from(rounds, value => value.label), ['Qualifying 1', 'Qualifying 2', 'Qualifying 3', 'Round of 32', 'Round of 16', 'Final']);
  assert.equal(new Set(rounds.map(round => round.key)).size, 6);
});
test('only wholly unknown scheduled matches are minimised; named, live and scored matches stay visible', () => {
  const { tournamentMatchPending } = load('src/lib/pro-tournament.ts');
  const row = { match: { status: 'scheduled', teams: [[], []], score: [] } };
  assert.equal(tournamentMatchPending(row), true);
  assert.equal(tournamentMatchPending({ match: { ...row.match, teams: [[{ id: 1, name: 'Known player' }], []] } }), false);
  assert.equal(tournamentMatchPending({ match: { ...row.match, status: 'live' } }), false);
  assert.equal(tournamentMatchPending({ match: { ...row.match, status: 'finished', score: [[6, 4], [6, 3]] } }), false);
  assert.equal(tournamentMatchPending({ match: { ...row.match, score: [[1, 0]] } }), false);
});

test('tournament category totals count known main-draw pairs once, independently of player order', () => {
  const { tournamentSummary } = load('src/lib/pro-tournament.ts');
  const a = { id: 1, nationality: 'ES' }, b = { id: 2, nationality: 'AR' };
  const row = (id, category, draw, teams) => ({ draw, match: { id, category, status: id === 1 ? 'live' : 'scheduled', teams } });
  const summary = tournamentSummary([row(1, 'men', 'main', [[a, b], []]), row(2, 'men', 'main', [[b, a], []]), row(3, 'men', 'qualy', [[a, { id: 3, nationality: 'FR' }], []]), row(4, 'women', 'main', [[{ id: 4 }, { id: 5 }], []])], 'men');
  assert.equal(summary.matches, 3);
  assert.equal(summary.pairs, 1);
  assert.equal(summary.countries, 3);
  assert.equal(summary.live, 1);
  assert.equal(summary.upcoming, 2);
});

test('tournament match filters combine category, draw, round, status and SAST day without overlapping draws', () => {
  const { filterTournamentMatches, tournamentMatchDay } = load('src/lib/pro-tournament.ts', { Intl });
  const row = (id, category, draw, round, status) => ({ draw, match: { id, category, round, status, scheduledAt: '2026-10-06T23:30:00Z' } });
  const rows = [row(1, 'men', 'main', 16, 'scheduled'), row(2, 'women', 'main', 16, 'scheduled'), row(3, 'men', 'qualy', 16, 'scheduled'), row(4, 'men', 'main', 8, 'scheduled'), row(5, 'men', 'main', 16, 'finished')];
  assert.equal(tournamentMatchDay(rows[0]), '2026-10-07');
  const selected = filterTournamentMatches(rows, { category: 'men', draw: 'main', round: 'main:16', status: 'upcoming', day: '2026-10-07' });
  assert.deepEqual(Array.from(selected, row => row.match.id), [1]);
});

test('match journey marks holds and breaks from game transitions and preserves set boundaries', () => {
  const { matchJourney } = load('src/lib/pro-match-journey.ts');
  const sets = matchJourney({ coverage: 'full', sets: [{ set_number: 1, set_score: '1-1', games: [
    { game_number: 1, game_score: '0-0', serving: 'team_1', points: ['0:0','15:0','15:15','30:15','40:15'] },
    { game_number: 2, game_score: '1-0', serving: 'team_1', points: ['0:0','0:15','0:30','0:40'] },
  ] }, { set_number: 2, set_score: null, games: [{ game_number: 1, game_score: '0-0', serving: 'team_2', points: ['0:0','15:0'] }] }] });
  assert.equal(sets.length, 2);
  assert.equal(sets[0].games[0].winner, 0);
  assert.equal(sets[0].games[0].break, false);
  assert.equal(sets[0].games[1].winner, 1);
  assert.equal(sets[0].games[1].break, true);
  assert.deepEqual(Array.from(sets[0].games[0].points), [3, 1]);
  assert.equal(sets[1].games[0].winner, null);
});
test('match journey handles advantage resets, tiebreak scores and missing game transitions', () => {
  const { matchJourney } = load('src/lib/pro-match-journey.ts');
  const game = matchJourney({ sets: [{ set_number: 1, set_score: null, games: [{ game_number: 1, game_score: '0-0', serving: 'team_1', points: ['0:0','15:0','30:0','40:0','40:15','40:30','40:40','AD:40','40:40','40:AD','40:40'] }] }] })[0].games[0];
  assert.deepEqual(Array.from(game.points), [5, 5]);
  assert.equal(game.winner, null);
  assert.equal(game.break, false);
  const tiebreak = matchJourney({ sets: [{ set_number: 1, set_score: '7-6', games: [{ game_number: 13, game_score: '6-6', serving: null, points: ['0:0','1:0','1:1','2:1'] }] }] })[0].games[0];
  assert.deepEqual(Array.from(tiebreak.points), [2, 1]);
  assert.equal(tiebreak.winner, 0);
  assert.equal(tiebreak.break, false);
});
test('live match alert worker sends only provider-confirmed live matches and skips scheduled times', async () => {
  const { refreshProMatchAlerts } = load('supabase/functions/deliver-push/pro-match-alerts.ts');
  const calls = [];
  const query = { select() { return this; }, eq() { return this; }, is() { return this; }, gt() { return this; }, limit: async () => ({ data: [{ match_id: 4 }], error: null }) };
  const database = { from: () => query, rpc: async (name, args) => { calls.push({ name, args }); return { data: 1, error: null }; } };
  let requests = 0;
  await refreshProMatchAlerts(database, 'server-secret', async () => { requests++; return Response.json({ data: [{ id: 1, status: 'scheduled' }, { id: 2, status: 'finished' }, { id: 4, status: 'live' }, { id: 5, status: 'ongoing' }], meta: { last_page: 1 } }); });
  assert.equal(requests, 1);
  assert.equal(calls[0].name, 'notify_pro_matches_live');
  assert.deepEqual(Array.from(calls[0].args.p_match_ids), [4, 5]);
  query.limit = async () => ({ data: [], error: null });
  await refreshProMatchAlerts(database, 'server-secret', async () => { throw new Error('should not fetch'); });
});
test('live match alert worker does not enqueue incomplete or failed provider responses', async () => {
  const { refreshProMatchAlerts } = load('supabase/functions/deliver-push/pro-match-alerts.ts');
  const query = { select() { return this; }, eq() { return this; }, is() { return this; }, gt() { return this; }, limit: async () => ({ data: [{ match_id: 4 }], error: null }) };
  const database = { from: () => query, rpc: async () => { throw new Error('Must not queue'); } };
  await assert.rejects(refreshProMatchAlerts(database, 'server-secret', async () => Response.json({ error: 'Unavailable' }, { status: 503 })), /unavailable/);
  await assert.rejects(refreshProMatchAlerts(database, 'server-secret', async () => Response.json({ data: [{ id: 4, status: 'live' }], meta: { last_page: 21 } })), /Incomplete/);
});

test('saved match state updates alert flags immediately and clears when the account changes', async () => {
  let authChanged;
  const calls = [];
  const client = { auth: { getSession: async () => ({ data: { session: { user: { id: 'user-a' } } } }), onAuthStateChange: fn => { authChanged = fn; } }, rpc: async (name, input) => { calls.push({ name, input }); return { data: [], error: null }; } };
  const { refreshMatchBookmarks, saveMatchBookmark, getMatchBookmarks } = load('src/lib/pro-match-bookmarks.ts', { require: name => name === './analytics' ? { trackEvent() {} } : ({ supabase: client }) });
  await refreshMatchBookmarks();
  const row = { match: { id: 44, tournamentName: 'Germany P2', teams: [[{ id: 1, name: 'First Player' }], [{ id: 2, name: 'Second Player' }]], playedAt: '2026-10-07' } };
  await saveMatchBookmark(row, true, false);
  assert.equal(getMatchBookmarks().get(44).notify, false);
  await saveMatchBookmark(row, true, true);
  assert.equal(getMatchBookmarks().get(44).notify, true);
  assert.equal(calls[calls.length - 1].input.p_notify, true);
  authChanged('SIGNED_OUT', null);
  assert.equal(getMatchBookmarks().size, 0);
});

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

test('live tournament list includes FIP events on later pages and excludes inactive events', async () => {
  const calls = [];
  const tournament = (id, name, status, level = 'fip_silver') => ({ id, name, status, level, start_date: '2026-10-07', end_date: '2026-10-11', photo_url: 'https://example.test/tournament.webp' });
  const { fetchLiveTournaments } = load('src/lib/pro-padel-live.ts', {
    require: () => ({ supabase: { functions: { invoke: async (_, { body }) => {
      calls.push(body);
      return { data: { meta: { last_page: 2 }, data: body.page === 1
        ? [tournament(845, 'FIP Silver Porec Parenzo', 'live'), tournament(747, 'Milano P1', 'pending', 'p1'), tournament(745, 'Rotterdam P2', 'finished', 'p2')]
        : [tournament(746, 'Germany P2 2026', 'live', 'p2'), tournament(846, 'FIP Silver R3 Bullpadel Cup Stratford', 'live'), tournament(845, 'FIP Silver Porec Parenzo', 'live'), tournament(0, 'Invalid event', 'live')] } };
    } } } }),
  });
  const events = await fetchLiveTournaments();
  assert.deepEqual(Array.from(events, event => event.id), [746, 845, 846]);
  assert.equal(events[1].level, 'fip_silver');
  assert.equal(events[1].photoUrl, 'https://example.test/tournament.webp');
  assert.deepEqual(calls.map(call => [call.kind, call.page]), [['live-tournaments', 1], ['live-tournaments', 2]]);
});

test('live tournament pagination failure is reported instead of returning an incomplete list', async () => {
  const { fetchLiveTournaments } = load('src/lib/pro-padel-live.ts', {
    require: () => ({ supabase: { functions: { invoke: async (_, { body }) => body.page === 1
      ? { data: { data: [], meta: { last_page: 2 } } }
      : { error: { context: Response.json({ error: 'Provider unavailable' }, { status: 503 }) } } } } }),
  });
  await assert.rejects(fetchLiveTournaments(), /Provider unavailable/);
});

test('live tournament proxy reads all circuits and caches each page independently', async () => {
  let handler, user = null;
  const requests = [];
  load('supabase/functions/pro-padel-explore/index.ts', {
    Deno: { env: { get: key => key }, serve: fn => { handler = fn; } },
    require: () => ({ createClient: () => ({ auth: { getUser: async () => ({ data: { user } }) } }) }),
    fetch: async url => { const request = new URL(url); requests.push(request); return Response.json({ data: [], meta: { last_page: 2 } }); },
  });
  const request = page => ({ method: 'POST', headers: new Headers(), json: async () => ({ kind: 'live-tournaments', page }) });
  assert.equal((await handler(request(1))).status, 401);
  user = { id: 'live-tour-user' };
  assert.equal((await handler(request(1))).status, 200);
  assert.equal((await handler(request(1))).status, 200);
  assert.equal((await handler(request(2))).status, 200);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].pathname, '/api/tournaments');
  assert.equal(requests[0].searchParams.has('level'), false);
  assert.equal(requests[0].searchParams.has('status'), false);
  assert.equal(requests[0].searchParams.get('per_page'), '50');
  assert.match(requests[0].searchParams.get('after_date'), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(requests[1].searchParams.get('page'), '2');
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

test('player matches acquire flags from the shared index without provider searches', async () => {
  let handler;
  const requests = [];
  load('supabase/functions/pro-padel-explore/index.ts', {
    Deno: { env: { get: key => key }, serve: fn => { handler = fn; } },
    require: () => ({ createClient: () => ({ rpc: async name => ({ data: name === 'cached_padel_players' ? [{id: 11, nationality: 'ES'}, {id: 12, nationality: 'AR'}, {id: 1, nationality: 'ZA'}, {id: 2, nationality: 'ES'}] : name === 'claim_padel_request' ? {action: 'fetch',lease_id:'test',request_id:1} : null }), auth: { getUser: async () => ({ data: { user: { id: 'flag-user' } } }) } }) }),
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
  assert.equal(requests.filter(request => request.pathname === '/api/players').length, 0);
});

test('tournament draw keeps results and enriches player flags', async () => {
  let handler;
  const requested = [];
  load('supabase/functions/pro-padel-explore/index.ts', {
    Deno: { env: { get: key => key }, serve: fn => { handler = fn; } },
    require: () => ({ createClient: () => ({ rpc: async name => ({ data: name === 'cached_padel_players' ? [{id: 11, nationality: 'ES'}, {id: 12, nationality: 'AR'}, {id: 1, nationality: 'ZA'}, {id: 2, nationality: 'ES'}] : name === 'claim_padel_request' ? {action: 'fetch',lease_id:'test',request_id:1} : null }), auth: { getUser: async () => ({ data: { user: { id: 'tour-user' } } }) } }) }),
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


test('saved live status never queues a match-start push',async()=>{
 const {refreshProMatchAlerts}=load('supabase/functions/deliver-push/pro-match-alerts.ts');
 const query={select(){return this;},eq(){return this;},is(){return this;},gt(){return this;},limit:async()=>({data:[{match_id:4}]})};
 await refreshProMatchAlerts({from:()=>query,rpc:()=>assert.fail('Historical live status cannot notify')},'server-secret',async()=>Response.json({data:[{id:4,status:'live'}],meta:{last_page:1}},{headers:{'x-4m-cache':'stale'}}));
});
