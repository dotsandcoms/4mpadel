import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSnapshot, normalizeCategory } from '../server/pro-padel.mjs';
import handler from '../api/pro-padel-sync.js';
import { requiresAuth } from '../src/utils/routeAccess.js';

const ranking = { id: 66, name: 'Example Player', category: 'men', type: 'official', ranking: 1, points: 1000, date: '2026-09-14', nationality: 'AR' };
const ranks = { data: [ranking], meta: { total: 4000 } };
test('normalization never exposes restricted fields, provider links or unsafe photo URLs', () => {
  const result = normalizeCategory(ranks, { data: [{ ...ranking, photo_url: 'javascript:alert(1)', height: 'hidden_free_plan', birthdate: 'hidden_free_plan', connections: { private: 'something' } }] }, 'men');
  assert.equal(result.players[0].photoUrl, null);
  assert.equal(result.players[0].height, null);
  assert.equal(result.players[0].birthdate, null);
  assert.equal('connections' in result.players[0], false);
  assert.equal(result.players[0].points, 1000);
});
test('ranking order and tied positions come from official snapshot, not profile rank', () => {
  const result = normalizeCategory({ data: [{ ...ranking, ranking: 2 }, { ...ranking, id: 67, name: 'Another player', ranking: 2 }] }, { data: [{ ...ranking, ranking: 900 }] }, 'men');
  assert.deepEqual(result.players.map((p) => p.rank), [2, 2]);
  assert.equal(result.players.find((p) => p.id === 67).detailsAvailable, false);
});
test('bad category, duplicate identities and empty snapshots fail before publication', () => {
  assert.throws(() => normalizeCategory(ranks, { data: [] }, 'women'), /contract/);
  assert.throws(() => normalizeCategory({ data: [ranking, ranking] }, { data: [] }, 'men'), /contract/);
  assert.throws(() => normalizeCategory({ data: [] }, { data: [] }, 'men'), /empty/);
});
test('a provider failure aborts the full snapshot and cannot return a partial refresh', async () => {
  let requests = 0;
  const wait = async () => {};
  await assert.rejects(buildSnapshot({ token: 'test-token', wait, fetchImpl: async () => {
    requests++;
    return requests < 3 ? Response.json(ranks) : new Response('private upstream body', { status: 429 });
  } }), /HTTP 429/);
  assert.equal(requests, 3);
});
test('cron denies missing and invalid authorization before any provider call', async () => {
  const original = process.env.CRON_SECRET;
  try {
    process.env.CRON_SECRET = 'test-secret';
    for (const authorization of ['', 'Bearer wrong', 'Bearer ééééééééééé']) {
      const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(data) { this.body = data; return this; } };
      await handler({ method: 'GET', headers: { authorization } }, res);
      assert.equal(res.code, 401);
    }
  } finally { if (original === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = original; }
});
test('pro browsing is public while existing member routes stay gated', () => {
  assert.equal(requiresAuth('/pro'), false);
  assert.equal(requiresAuth('/pro/players/66'), false);
  assert.equal(requiresAuth('/profile'), true);
  assert.equal(requiresAuth('/players'), true);
});

test('tour normalization preserves tiebreak scores and explicit match outcomes', async () => {
  const { normalizeMatch, normalizeTournament } = await import('../server/pro-padel.mjs');
  const tournament = normalizeTournament({ id: 1, name: 'Example Major', start_date: '2026-09-01', end_date: '2026-09-07', level: 'major' });
  const match = normalizeMatch({ id: 3, category: 'men', round: 1, status: 'finished', played_at: '2026-09-07', winner: 'team_1',
    players: { team_1: [{ id: 66, name: 'Player One' }], team_2: [{ id: 67, name: 'Player Two' }] },
    score: [{ team_1: '7', team_2: '6(1)' }], duration: 'hidden_free_plan',
  }, tournament);
  assert.deepEqual(match.score, [['7', '6(1)']]);
  assert.equal(match.winner, 'team_1');
  assert.equal('duration' in match, false);
  assert.equal(match.tournamentName, 'Example Major');
});

test('selected-round records exclude byes, walkovers and unfinished matches', async () => {
  const { playerResult } = await import('../src/utils/proPadelView.js');
  const match = { status: 'finished', winner: 'team_1', teams: [[{ id: 1 }], [{ id: 2 }]] };
  assert.equal(playerResult(match, 1), 'W');
  assert.equal(playerResult(match, 2), 'L');
  assert.equal(playerResult(match, 3), null);
  for (const status of ['bye', 'walkover', 'scheduled', 'live', 'ended']) assert.equal(playerResult({ ...match, status }, 1), null);
});

test('calendar export includes the full last day and escapes event text', async () => {
  const { tournamentCalendar } = await import('../src/utils/proPadelView.js');
  const calendar = tournamentCalendar({ id: 4, name: 'Test, Major; 2026\nFinals', startDate: '2026-09-28', endDate: '2026-10-04', location: 'Rotterdam' });
  assert.match(calendar, /DTSTART;VALUE=DATE:20260928/);
  assert.match(calendar, /DTEND;VALUE=DATE:20261005/);
  assert.match(calendar, /SUMMARY:Test\\, Major\\; 2026\\nFinals/);
  assert.throws(() => tournamentCalendar({ startDate: 'invalid', endDate: 'invalid' }), /Invalid tournament dates/);
});

test('personal feed deduplicates partners, includes both categories and excludes unrelated matches', async () => {
  const { followedMatches } = await import('../src/utils/proFeed.js');
  const match = (id, category, players, playedAt) => ({ id, category, teams: [players.map((id) => ({ id })), []], playedAt, round: 1 });
  const shared = match(1, 'men', [66, 67], '2026-09-01');
  const women = match(2, 'women', [80], '2026-09-02');
  assert.deepEqual(followedMatches([shared, shared, women, match(3, 'men', [99], '2026-09-03')], [{ player_id: 66 }, { player_id: 67 }, { player_id: 80 }]).map((m) => m.id), [2, 1]);
  assert.deepEqual(followedMatches([shared], []), []);
});

test('fixtures paginate both categories, exclude finished matches, and preserve scheduling uncertainty', async () => {
  const { buildFixtureSnapshot } = await import('../server/pro-padel.mjs');
  const tournament = { id: 745, name: 'Upcoming P2', start_date: '2026-09-28', end_date: '2026-10-04', status: 'pending', level: 'p2' };
  const row = { id: 1, category: 'men', round: 16, status: 'scheduled', players: { team_1: [{ id: 66, name: 'Player' }], team_2: null }, scheduled_at: '2026-09-28T14:00:00+02:00', schedule_label: 'Estimated around 2 PM' };
  let calls = 0; const waits = [];
  const result = await buildFixtureSnapshot({ token: 'test', now: () => new Date('2026-09-17T00:00:00Z'), wait: async (ms) => waits.push(ms), fetchImpl: async (url) => {
    calls++; assert.equal(url.origin, 'https://padelapi.org');
    if (calls === 1) return Response.json({ data: [tournament], meta: { last_page: 1 } });
    assert.equal(url.searchParams.get('page'), String(calls - 1));
    return Response.json({ data: calls === 2 ? [row, { ...row, id: 2, status: 'finished' }] : [{ ...row, id: 3, category: 'women', scheduled_at: '2026-09-28 14:00:00' }], meta: { current_page: calls - 1, last_page: 2 } });
  } });
  assert.equal(calls, 3); assert.deepEqual(waits, [6500, 6500]);
  assert.deepEqual(result.matches.map((m) => m.id), [1, 3]);
  assert.equal(result.matches[0].scheduledAt, '2026-09-28T12:00:00.000Z');
  assert.equal(result.matches[1].scheduledAt, null);
  assert.equal(result.matches[0].scheduleLabel, row.schedule_label);
  assert.deepEqual(result.matches[0].teams[1], []);
});

test('unpublished draws return honest empty fixtures; oversized pagination fails atomically', async () => {
  const { buildFixtureSnapshot } = await import('../server/pro-padel.mjs');
  const tournament = { id: 745, name: 'Upcoming P2', start_date: '2026-09-28', end_date: '2026-10-04', status: 'pending' };
  for (const last_page of [1, 5]) {
    let calls = 0;
    const build = () => buildFixtureSnapshot({ token: 'test', now: () => new Date('2026-09-17'), wait: async () => {}, fetchImpl: async () => Response.json(++calls === 1 ? { data: [tournament], meta: { last_page: 1 } } : { data: [], meta: { current_page: 1, last_page } }) });
    if (last_page === 5) await assert.rejects(build(), /pagination/);
    else { const result = await build(); assert.equal(result.drawPublished, false); assert.deepEqual(result.matches, []); }
  }
});

test('ranking changes preserve gains, losses and zero while restricted or invalid values stay unknown', () => {
  for (const [rankDiff, pointsDiff, expectedRank, expectedPoints] of [[3,120,3,120],[-2,-71,-2,-71],[0,0,0,0],['hidden_free_plan',null,null,null],[1.5,'hidden_free_plan',null,null],['2','45',2,45]]) {
    const result=normalizeCategory({data:[{...ranking,ranking_diff:rankDiff,points_diff:pointsDiff}]},{data:[]},'men').players[0];
    assert.equal(result.rankChange,expectedRank);assert.equal(result.pointsChange,expectedPoints);
  }
});
