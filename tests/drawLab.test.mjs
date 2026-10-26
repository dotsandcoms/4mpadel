import test from 'node:test';
import assert from 'node:assert/strict';
import {
    DEFAULT_LAB_CONFIG,
    addLabElimination,
    areAllGroupsComplete,
    buildLabDraft,
    createFakePlayers,
    getLabStandings,
    pairFakePlayers,
    recordLabResult,
    scheduleLabMatches,
    simulateAllPlayable,
} from '../src/utils/drawLab.js';

test('64 fake players create 32 isolated teams and a complete knockout', () => {
    const players = createFakePlayers(64);
    const teams = pairFakePlayers(players);
    assert.equal(players.length, 64);
    assert.equal(teams.length, 32);
    assert.equal(new Set(players.map((player) => player.id)).size, 64);
    assert.equal(new Set(players.map((player) => player.name)).size, 64);
    assert.equal(new Set(teams.map((team) => team.team_name)).size, 32);

    const draft = buildLabDraft(teams, DEFAULT_LAB_CONFIG);
    assert.equal(draft.draw_size, 32);
    assert.equal(draft.matches.filter((match) => match.stage === 'knockout').length, 31);
    const completed = simulateAllPlayable(draft);
    assert.equal(completed.matches.filter((match) => match.stage === 'knockout' && match.status !== 'completed').length, 0);
    assert.ok(completed.matches.find((match) => match.round_label === 'Final')?.winner_entry_id);
});

test('group results produce standings and group-to-knockout advancers', () => {
    const teams = pairFakePlayers(createFakePlayers(16));
    const config = { ...DEFAULT_LAB_CONFIG, playerCount: 16, format: 'group_knockout', groupCount: 2, advancersPerGroup: 2 };
    let draft = buildLabDraft(teams, config);
    const first = draft.matches[0];
    draft = recordLabResult(draft, first.key, first.entry_one.id);
    assert.equal(getLabStandings(draft, first.group_id)[0].entry_id, first.entry_one.id);
    draft = simulateAllPlayable(draft);
    assert.equal(areAllGroupsComplete(draft), true);
    draft = addLabElimination(draft, config);
    assert.equal(draft.matches.filter((match) => match.stage === 'knockout').length, 3);
});

test('local scheduler uses configured courts and does not mutate entries', () => {
    const teams = pairFakePlayers(createFakePlayers(16));
    const draft = buildLabDraft(teams, { ...DEFAULT_LAB_CONFIG, playerCount: 16 });
    const scheduled = scheduleLabMatches(draft, { ...DEFAULT_LAB_CONFIG, courtCount: 3 });
    assert.deepEqual(scheduled.matches.slice(0, 3).map((match) => match.court_name), ['Court 1', 'Court 2', 'Court 3']);
    assert.equal(scheduled.entries, draft.entries);
});
