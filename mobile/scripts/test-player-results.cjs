const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function resultsApi({ points = async () => [], trophies = async () => [], snapshot = async () => ({results:[]}) } = {}) {
  const calls = [];
  const exports = {};
  const rankings = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/rankings.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module: rankings, exports: rankings.exports, require: () => ({ supabase: {} }) });
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/player-results.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports,
    require: () => ({
      fetchPoints: (...args) => { calls.push(args); return points(...args); },
      fetchTournamentWins: trophies,
      resolveResultIdentity: rankings.exports.resolveResultIdentity,
      fetchPointSnapshot: snapshot,
    }),
  });
  return { ...exports, calls };
}

test('results use the exact ranking participant and age group for counted and full history', async () => {
  const h = resultsApi();
  await h.fetchPlayerTournamentResults({ ranking_participant_id: 201351, age_group_id: 82, ranking_id: 15809 });
  assert.deepEqual(h.calls, [['201351', 82, false], ['201351', 82, true]]);
});

test('Best 8 uses the provider counted list and All preserves the complete history', async () => {
  // Counted results can include proportions or leagues: do not blindly slice to eight.
  const counted = Array.from({ length: 9 }, (_, i) => ({ name: `Counted ${i}`, points: i * 10 }));
  const all = Array.from({ length: 18 }, (_, i) => ({ name: `Event ${i}`, points: i }));
  const h = resultsApi({ points: async (_id, _age, showAll) => showAll ? all : counted });
  const result = await h.fetchPlayerTournamentResults({ ranking_participant_id: 201351, age_group_id: 82 });
  assert.equal(result.counted.length, 9);
  assert.equal(result.counted[0].points, 0);
  assert.equal(counted[0].points, 0);
  assert.equal(result.all.length, 18);
  assert.equal(result.all, all);
});

test('Adam Best 8 matches RankedIn date order and retains the 20 September event second', async () => {
  const counted = [
    ['18/10/2026', 'Growthpoint SA Nationals 2026 - Open', 2600],
    ['20/09/2026', 'The Cape Town Open- CHANGAN SA GRAND TOUR', 1500],
    ['16/08/2026', 'The Pretoria Major', 2600],
    ['05/07/2026', 'SA Grand Open - SAPA 1500 Super Gold', 900],
    ['21/06/2026', 'SAPA 1000 GOLD Tournament @ VAPC LONEHILL', 1000],
    ['14/06/2026', 'Pretoria P1 Wild Card tournament', 1560],
    ['19/04/2026', 'Padel 365 SAPA Cape Town Major presented by Broll', 1560],
    ['29/03/2026', 'BROLL KCC CUP - SAPA 2000 MAJOR JHB', 2600],
  ].map(([date, name, points]) => ({ date, name, points }));
  const h = resultsApi({ points: async (_id, _age, all) => all ? [] : counted });
  const result = await h.fetchPlayerTournamentResults({ ranking_participant_id: 201351, age_group_id: 82 });
  assert.deepEqual(Array.from(result.counted, row => row.date), counted.map(row => row.date));
  assert.equal(result.counted[1].name, 'The Cape Town Open- CHANGAN SA GRAND TOUR');
  assert.equal(result.counted.length, 8);
  assert.equal(result.counted.reduce((sum, row) => sum + row.points, 0), 14320);
});

test('missing ranking identity never substitutes a local ID or another category', async () => {
  for (const ranking of [{}, { ranking_participant_id: 'R000258011', age_group_id: 82 }, { ranking_participant_id: 201351 }, { ranking_participant_id: 201351, age_group_id: -1 }]) {
    const h = resultsApi();
    await assert.rejects(h.fetchPlayerTournamentResults(ranking), /not linked/);
    assert.equal(h.calls.length, 0);
  }
});

test('a failed full-history lookup cannot pass saved Best 8 off as All', async () => {
  const h = resultsApi({ points: async (_id, _age, all) => {
    if (all) throw new Error('History unavailable');
    return [{ name: 'Saved winner', points: 100 }];
  } });
  await assert.rejects(h.fetchPlayerTournamentResults({ ranking_participant_id: 201351, age_group_id: 82 }), /History unavailable/);
});

test('trophies include every organisation and retain standing, date and division for deduplication', async () => {
  let source;
  const h = resultsApi({ trophies: async value => { source = value; return []; } });
  await h.fetchPlayerTrophies({ id: '293', name: 'Player', rankings: [
    { org: 'SAPA ranking', details: [{ name: 'Major', date: '16/08/2026', class: 'Open', place: 1, points: '2600', event_type: 'tournament' }] },
    { org: 'Broll', details: [{ name: 'Major', date: '16/08/2026', class: 'Open', place: '1', points: 1000 }] },
  ] });
  assert.equal(source.profile.rankings.length, 2);
  assert.equal(source.profile.rankings[0].details[0].place, '1');
  assert.equal(source.profile.rankings[0].details[0].points, 2600);
  assert.equal(source.profile.rankings[0].details[0].date, '16/08/2026');
  assert.equal(source.profile.rankings[0].details[0].class, 'Open');
});

test('profile summary uses the provider total and rank from the same counted edition', async () => {
  const h=resultsApi({snapshot:async()=>({points:14320,rank:1,results:[{name:'Nationals',points:2600}]})});
  const row=await h.fetchPlayerRankingSnapshot({ranking_participant_id:201351,age_group_id:82,points:12620,rank:2});
  assert.equal(row.points,14320);assert.equal(row.rank,1);assert.equal(row.details[0].name,'Nationals');
});
