import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRankingSelection, rankingSelectionMatches, buildClassSeedPlan, syncRankedinClassSeeds } from '../supabase/functions/sync-to-rankedin/ranking-sync.mjs';

const division = { name: "Men's Elite (indicative 5+)", seeding_ranking_source: 'active' };
const profile = (id, points) => ({ rankedin_id: `R${id}`, points: points * 10,
  rankings: [{ org: 'SAPA ranking', age_group: 'Men-Main', match_type: 'Men-Doubles', points }] });
const profiles = [profile(1, 12620), profile(2, 10948), profile(3, 6520), profile(4, 10020), profile(5, 7672), profile(6, 7672)];
const row = (id, a, b, seed = '') => ({ Id: id, Rank: '', Paid: false, IsDrawCreated: false, IsAnyMatchGenerated: false,
  Participant: { TournamentPlayerId: id, Seed: seed, FirstPlayer: { Id: a, RankedinId: `R${a}` }, SecondPlayer: { Id: b, RankedinId: `R${b}` } } });
const settings = () => ({ Id: 75314, SelectedTournamentClass: 178290, EventState: 5, IsAdmin: true,
  AreDrawsGeneratedForSelectedClass: true, Participants: [row(103, 5, 6), row(101, 1, 2), row(102, 3, 4)] });

test('connects the approved federation ranking when missing', () => {
  assert.deepEqual(buildRankingSelection({ selectedRankings: [], seedRankingId: null }, '15809'), {
    SelectedRankings: [{ id: 15809 }], SeedRankingId: 15809, addedRanking: true, changedSeedRanking: true,
  });
});
test('preserves existing rankings and seed source while adding the federation', () => {
  const input = { selectedRankings: [{ id: 7 }, { Id: 7 }, { id: 8 }], seedRankingId: 8 };
  const result = buildRankingSelection(input, 15809);
  assert.deepEqual(result.SelectedRankings, [{ id: 7 }, { id: 8 }, { id: 15809 }]);
  assert.equal(result.SeedRankingId, 8);
  assert.equal(input.selectedRankings.length, 3);
});
test('ranking lookup errors cannot silently clear the selected rankings', () => {
  for (const value of [{}, { selectedRankings: null }, { selectedRankings: [{ id: 'bad' }] }]) {
    assert.throws(() => buildRankingSelection(value), /not saved/);
  }
});
test('no configuration does not invent a ranking', () => {
  const result = buildRankingSelection({ selectedRankings: [], seedRankingId: null });
  assert.deepEqual(result.SelectedRankings, []);
  assert.equal(result.SeedRankingId, null);
});
test('verifies that the selected rankings and seeding source survived the edit', () => {
  const expected = buildRankingSelection({ selectedRankings: [{ id: 7 }], seedRankingId: 7 }, 15809);
  assert.equal(rankingSelectionMatches({ selectedRankings: [{ id: 15809 }, { id: 7 }], seedRankingId: 7 }, expected), true);
  assert.equal(rankingSelectionMatches({ selectedRankings: [], seedRankingId: null }, expected), false);
  assert.equal(rankingSelectionMatches({ selectedRankings: [{ id: 15809 }, { id: 7 }], seedRankingId: 15809 }, expected), false);
});
test('team seeds use the same division SAPA points as 4M, regardless of API order', () => {
  const model = settings();
  const before = structuredClone(model);
  const plan = buildClassSeedPlan(model, profiles, division);
  assert.equal(plan.updated, 3);
  assert.deepEqual(plan.changes.map((r) => [r.tournamentPlayerId, r.seed, r.points]), [[103, '3', 15344], [101, '1', 23568], [102, '2', 16540]]);
  assert.deepEqual(model, before);
  assert.equal(plan.payload.Participants[0].Paid, false);
  assert.equal(plan.payload.Participants[0].Rank, '');
});
test('explicit division ranking overrides profile preferences', () => {
  const plan = buildClassSeedPlan(settings(), profiles, { name: 'Open', seeding_ranking_source: 'category:SAPA|Men-Main|Doubles' });
  assert.equal(plan.changes.find((r) => r.tournamentPlayerId === 101).points, 23568);
});
test('teams with zero or missing ranking points remain unseeded', () => {
  const model = settings(); model.Participants.push(row(104, 9, 10));
  const plan = buildClassSeedPlan(model, profiles, division);
  assert.equal(plan.updated, 3);
  assert.equal(plan.payload.Participants[3].Participant.Seed, '');
});
test('existing seeds differing from 4M are preserved', () => {
  const model = settings(); model.Participants[0].Participant.Seed = '1';
  assert.equal(buildClassSeedPlan(model, profiles, division).reason, 'existing_seeds');
});
test('rerunning saved seeds is a no-op', () => {
  const seeded = buildClassSeedPlan(settings(), profiles, division).payload;
  assert.equal(buildClassSeedPlan(seeded, profiles, division).reason, 'already_seeded');
});
test('a new lower ranked team can be seeded without changing existing seeds', () => {
  const seeded = buildClassSeedPlan(settings(), profiles, division).payload;
  seeded.Participants.push(row(104, 7, 8));
  const plan = buildClassSeedPlan(seeded, [...profiles, profile(7, 10), profile(8, 10)], division);
  assert.deepEqual(plan.changes.map((r) => r.seed), ['4']);
});
test('draws, generated matches, started and finished events cannot be reseeded', () => {
  for (const patch of [{ IsDrawCreated: true }, { IsAnyMatchGenerated: true }]) {
    const model = settings(); Object.assign(model.Participants[0], patch);
    assert.equal(buildClassSeedPlan(model, profiles, division).reason, 'draws_exist');
  }
  for (const state of [2, 3, 4, 6, 7, 99]) {
    assert.equal(buildClassSeedPlan({ ...settings(), EventState: state }, profiles, division).reason, 'tournament_locked');
  }
});
test('duplicate profiles with identical points produce the same seeds', () => {
  assert.deepEqual(buildClassSeedPlan(settings(), [...profiles, profiles[0]], division).changes,
    buildClassSeedPlan(settings(), profiles, division).changes);
});
test('conflicting profiles and duplicate entrant identities fail closed', () => {
  assert.throws(() => buildClassSeedPlan(settings(), [...profiles, profile(1, 1)], division), /same RankedIn ID/);
  const model = settings(); model.Participants.push(model.Participants[0]);
  assert.throws(() => buildClassSeedPlan(model, profiles, division), /duplicate tournament player IDs/);
});

const response = (value, status = 200) => new Response(JSON.stringify(value), { status });
const syncOptions = { apiBase: 'https://api.rankedin.test/v1', tournamentId: '75314', classId: '178290', headers: {}, division, loadProfiles: async () => profiles };
test('saves the full RankedIn model with only seeds changed and verifies it', async () => {
  const calls = []; let saved;
  const result = await syncRankedinClassSeeds({ ...syncOptions, fetchImpl: async (url, options) => {
    calls.push({ url, method: options.method || 'GET' });
    if (options.method === 'POST') { saved = JSON.parse(options.body); return response(true); }
    return response(saved || settings());
  } });
  assert.equal(result.status, 'ok'); assert.equal(result.updated, 3);
  assert.deepEqual(calls.map((r) => r.method), ['GET', 'POST', 'GET']);
  assert.match(calls[1].url, /UpdatePlayerSettingsAsync$/);
  const restored = structuredClone(saved); restored.Participants.forEach((r) => { r.Participant.Seed = ''; });
  assert.deepEqual(restored, settings());
});
test('a preview performs no writes', async () => {
  const result = await syncRankedinClassSeeds({ ...syncOptions, dryRun: true, fetchImpl: async (_url, options) => {
    assert.equal(options.method, undefined); return response(settings());
  } });
  assert.equal(result.status, 'preview');
});
test('an incorrect tournament or lack of admin access performs no writes', async () => {
  for (const patch of [{ Id: 1 }, { SelectedTournamentClass: 1 }, { IsAdmin: false }]) {
    await assert.rejects(syncRankedinClassSeeds({ ...syncOptions, fetchImpl: async (_url, options) => {
      assert.equal(options.method, undefined); return response({ ...settings(), ...patch });
    } }));
  }
});
test('an HTTP success that does not save seeds is reported as a failure', async () => {
  await assert.rejects(syncRankedinClassSeeds({ ...syncOptions, fetchImpl: async (_url, options) => (
    options.method === 'POST' ? response(false) : response(settings())
  ) }), /did not retain/);
});
test('read and save HTTP failures are reported', async () => {
  await assert.rejects(syncRankedinClassSeeds({ ...syncOptions, fetchImpl: async () => response({}, 403) }), /read RankedIn seeds/);
  await assert.rejects(syncRankedinClassSeeds({ ...syncOptions, fetchImpl: async (_url, options) => options.method === 'POST'
    ? response({}, 400) : response(settings()) }), /save RankedIn seeds/);
});
