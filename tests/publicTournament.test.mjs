import test from 'node:test';
import assert from 'node:assert/strict';
import { bracketSections, bracketRounds, publicTournamentTab, tournamentParams, tournamentDivisions, publicSchedule, scheduleCourts, scoreColumns, sastDay, sastTime, matchStatusLabel } from '../src/utils/publicTournament.js';

const match = (id, extra = {}) => ({ id, draw_id: 'draw', division_id: 'men', stage: 'knockout', round_number: 1, round_label: 'Quarterfinals', bracket_position: 1, entry_one_id: `${id}-one`, entry_two_id: `${id}-two`, status: 'pending', ...extra });
test('public tabs support FIP-style names and existing draw and match links', () => {
    assert.equal(publicTournamentTab(new URLSearchParams()), 'order-of-play');
    assert.equal(publicTournamentTab(new URLSearchParams('tab=Order+of+Play')), 'order-of-play');
    assert.equal(publicTournamentTab(new URLSearchParams('tab=Player+List')), 'players');
    assert.equal(publicTournamentTab(new URLSearchParams('draw=one')), 'draws');
    assert.equal(publicTournamentTab(new URLSearchParams('match=one')), 'draws');
    assert.equal(publicTournamentTab(new URLSearchParams('tab=unknown')), 'order-of-play');
});
test('changing views preserves division, day and draw; closing a match removes only its deep link', () => {
    const current = new URLSearchParams('tab=draws&draw=one&division=men&day=2026-10-11&match=final');
    const result = tournamentParams(current, { tab: 'results', match: null });
    assert.equal(result.get('tab'), 'results');
    assert.equal(result.get('draw'), 'one');
    assert.equal(result.get('division'), 'men');
    assert.equal(result.get('day'), '2026-10-11');
    assert.equal(result.has('match'), false);
    assert.equal(current.get('match'), 'final');
});
test('division selection always starts with the main draw, even when plates were loaded first', () => {
    const draws = [{ id: 'silver', division_id: 'men', draw_kind: 'silver', tournament_divisions: { name: 'Men' } }, { id: 'main', division_id: 'men', draw_kind: 'main' }];
    assert.deepEqual(tournamentDivisions(draws)[0].draws.map(draw => draw.id), ['main', 'silver']);
});
test('all placement branches stay available without mixing their rounds into the main bracket', () => {
    const branches = bracketSections([match('main'), match('bronze', { stage: 'placement', round_code: 'places_13_16_r1', round_label: 'Places 13–16' }), match('top8', { stage: 'placement', round_code: 'places_5_8_r1' }), match('third', { stage: 'placement', round_code: '3_4' }), match('silver', { stage: 'placement', round_code: 'places_9_16_r1' })]);
    assert.deepEqual(branches.map(branch => branch.label), ['Main draw', 'Places 3–4', 'Places 5–8', 'Places 9–16', 'Places 13–16']);
    assert.deepEqual(branches[0].matches.map(row => row.id), ['main']);
});
test('rounds and opening slots sort by bracket position rather than database row order', () => {
    const rounds = bracketRounds([match('qf4', { bracket_position: 4 }), match('final', { round_number: 3, round_label: 'Final' }), match('qf1')]);
    assert.deepEqual(rounds.map(round => round.number), [1, 3]);
    assert.deepEqual(rounds[0].matches.map(row => row.id), ['qf1', 'qf4']);
});
test('order of play omits byes and cancellations but retains unresolved future feeder matches', () => {
    const rows = [match('qf1', { winner_to_match_id: 'semi', winner_to_slot: 1, scheduled_start: '2026-10-10T06:30:00Z' }), match('qf2', { winner_to_match_id: 'semi', winner_to_slot: 2, scheduled_start: '2026-10-10T06:30:00Z' }), match('semi', { entry_one_id: null, entry_two_id: null, round_number: 2, scheduled_start: '2026-10-10T09:30:00Z' }), match('bye', { entry_two_id: null, status: 'completed', winner_entry_id: 'bye-one', scheduled_start: '2026-10-10T06:30:00Z' }), match('cancelled', { status: 'cancelled', scheduled_start: '2026-10-10T06:30:00Z' })];
    assert.deepEqual(publicSchedule(rows).map(row => row.id), ['qf1', 'qf2', 'semi']);
});
test('South African dates and times remain correct across the UTC midnight boundary', () => {
    assert.equal(sastDay('2026-10-10T22:30:00Z'), '2026-10-11');
    assert.equal(sastTime('2026-10-10T22:30:00Z'), '00:30');
    assert.equal(sastDay('invalid'), '');
});
test('court grouping uses exact day and division filters and natural court numbering', () => {
    const rows = publicSchedule([match('ten', { court_name: 'Court 10', scheduled_start: '2026-10-10T06:30:00Z' }), match('two', { court_name: 'Court 2', scheduled_start: '2026-10-10T06:30:00Z' }), match('women', { division_id: 'women', court_name: 'Court 1', scheduled_start: '2026-10-10T06:30:00Z' }), match('tomorrow', { court_name: 'Court 2', scheduled_start: '2026-10-11T07:00:00Z' })]);
    assert.deepEqual(scheduleCourts(rows, '2026-10-10', 'men').map(court => court.name), ['Court 2', 'Court 10']);
    assert.equal(scheduleCourts(rows, '2026-10-11').length, 1);
    assert.equal(scheduleCourts(rows, '2026-10-12').length, 0);
});
test('scores retain bracket order, tiebreaks, zeros and explicit summary-only results', () => {
    const row = match('one', { status: 'completed', result_summary: [1, 2] });
    const sets = [{ match_id: 'one', set_number: 2, entry_one_games: 6, entry_two_games: 7, entry_one_tiebreak: 4, entry_two_tiebreak: 7 }, { match_id: 'one', set_number: 1, entry_one_games: 6, entry_two_games: 0 }];
    const result = scoreColumns(row, sets);
    assert.equal(result[0].total, 1);
    assert.equal(result[1].total, 2);
    assert.deepEqual(result[1].sets.map(set => set.games), [0, 7]);
    assert.equal(result[0].sets[1].tiebreak, 4);
    assert.deepEqual(scoreColumns({ ...row, result_summary: [0, 2] }, [])[0], { total: 0, sets: [] });
});
test('automatic advances, live matches and retirements have distinct truthful labels', () => {
    assert.equal(matchStatusLabel(match('bye', { status: 'completed', entry_two_id: null })), 'Bye');
    assert.equal(matchStatusLabel(match('live', { status: 'in_progress' })), 'Live');
    assert.equal(matchStatusLabel(match('retired', { status: 'retired', result_type: 'retirement' })), 'Retired');
    assert.equal(matchStatusLabel(match('waiting')), 'Time TBC');
});

test('partial live and retirement games never count as a won set', () => {
    const row = match('live', { status: 'in_progress' });
    const sets = [{ match_id: 'live', set_number: 1, entry_one_games: 6, entry_two_games: 4 }, { match_id: 'live', set_number: 2, entry_one_games: 3, entry_two_games: 1 }];
    assert.deepEqual(scoreColumns(row, sets).map(side => side.total), [1, 0]);
});
test('rotation order of play uses saved pairs and preserves tied points without inventing a winner', async () => {
    const { publicRotations } = await import('../src/utils/publicTournament.js');
    const draws = [{ id: 'rotation', division_id: 'mixed', scoring_rules: { americano: { players: ['a', 'b', 'c', 'd'].map(id => ({ id, name: id })), fixtures: [{ id: 'r1', one: ['a', 'c'], two: ['b', 'd'], score: [12, 12], round: 1, court: 2, scheduled_start: '2026-10-10T06:30:00Z' }] } } }];
    const result = publicRotations(draws);
    assert.equal(result.entries[0].team_name, 'a / c');
    assert.equal(result.matches[0].winner_entry_id, null);
    assert.equal(result.matches[0].score_unit, 'points');
    assert.deepEqual(scoreColumns(result.matches[0], []).map(side => side.total), [12, 12]);
    assert.equal(publicSchedule(result.matches).length, 1);
});

test('an automatic bye stored as a walkover is presented as an advance, not an opponent withdrawal', () => {
    assert.equal(matchStatusLabel(match('bye', { status: 'walkover', result_type: 'walkover', entry_one_id: null, winner_entry_id: 'bye-two' })), 'Bye');
    assert.equal(matchStatusLabel(match('actual-walkover', { status: 'walkover', result_type: 'walkover' })), 'Walkover');
});
