import test from 'node:test';
import assert from 'node:assert/strict';
import { divisionWorkflow } from '../src/utils/drawWorkflow.js';

const division = { id: 'division' };
const draw = { id: 'draw', division_id: division.id, draw_kind: 'main', format: 'knockout', status: 'draft' };
const entries = [
    { id: 'one', draw_id: draw.id, player_one_id: 1, player_two_id: 2, player_two_name: 'Partner' },
    { id: 'two', draw_id: draw.id, player_one_id: 3, player_two_id: 4, player_two_name: 'Partner' },
];
const match = { id: 'match', draw_id: draw.id, stage: 'knockout', entry_one_id: 'one', entry_two_id: 'two', status: 'pending' };
const data = { draws: [draw], entries, matches: [match], reviews: { division: { valid: true } } };

test('new divisions start with teams; confirmed divisions proceed to draw', () => {
    assert.equal(divisionWorkflow(division).next, 'players');
    assert.equal(divisionWorkflow(division, { reviews: data.reviews }).next, 'setup');
    assert.equal(divisionWorkflow(division).complete, false);
});
test('saved draft continues to schedule and publish, never repeats approved teams', () => {
    const state = divisionWorkflow(division, data);
    assert.equal(state.next, 'schedule');
    assert.deepEqual(state.steps.map(step => step.complete), [true, true, false, false]);
});
test('published entrants remain confirmed after registration changes', () => {
    const state = divisionWorkflow(division, { ...data, reviews: {}, draws: [{ ...draw, status: 'published' }] });
    assert.equal(state.steps[0].complete, true);
    assert.equal(state.next, 'schedule');
});
test('automatic byes do not need a court; fully scheduled published draws open results', () => {
    const state = divisionWorkflow(division, { ...data, draws: [{ ...draw, status: 'published' }], matches: [
        { ...match, scheduled_start: '2026-10-10T08:00:00Z', court_name: 'Court 1' },
        { ...match, id: 'bye', entry_two_id: null, winner_entry_id: 'one', status: 'walkover' },
    ] });
    assert.equal(state.playable, 1);
    assert.equal(state.scheduled, 1);
    assert.equal(state.steps[2].complete, true);
    assert.equal(state.next, 'run');
});
test('results in progress take precedence over remaining scheduling', () => {
    const state = divisionWorkflow(division, { ...data, draws: [{ ...draw, status: 'in_progress' }], matches: [{ ...match, status: 'in_progress' }] });
    assert.equal(state.next, 'run');
});
test('completed knockout still needs every linked player award; zero awards count', () => {
    const state = { ...data, draws: [{ ...draw, status: 'completed' }], matches: [{ ...match, status: 'completed' }] };
    assert.equal(divisionWorkflow(division, state).label, 'Review points');
    const awards = [1, 2, 3, 4].map(player_id => ({ division_id: division.id, player_id, points: 0 }));
    const finished = divisionWorkflow(division, { ...state, awards });
    assert.equal(finished.complete, true);
    assert.equal(finished.awardCount, 4);
    assert.equal(finished.next, 'run');
    assert.equal(divisionWorkflow(division, { ...state, awards: awards.slice(0, 3) }).complete, false);
});
test('another division awards cannot complete this division, and missing profiles need attention', () => {
    const completed = { ...data, draws: [{ ...draw, status: 'completed' }], awards: [1, 2, 3, 4].map(player_id => ({ division_id: 'other', player_id })) };
    assert.equal(divisionWorkflow(division, completed).complete, false);
    assert.equal(divisionWorkflow(division, { ...completed, entries: [{ ...entries[0], player_two_id: null }] }).pointsComplete, false);
});
test('completed Americano has no knockout points approval requirement', () => {
    assert.equal(divisionWorkflow(division, { draws: [{ ...draw, format: 'americano', status: 'completed' }] }).complete, true);
});

test('a played walkover counts as a result without requiring a booking', () => {
    const state = divisionWorkflow(division, { ...data, draws: [{ ...draw, status: 'published' }], matches: [{ ...match, status: 'walkover', result_type: 'walkover', winner_entry_id: 'one' }] });
    assert.equal(state.playable, 0);
    assert.equal(state.finished, 1);
    assert.equal(state.resultsTotal, 1);
    assert.equal(state.steps[3].detail, '1/1 results recorded');
    assert.equal(state.next, 'run');
});

test('a private draft returns to teams if its approved registration list changed', () => {
    const state = divisionWorkflow(division, { ...data, reviews: { division: { confirmed_at: '2026-10-19', valid: false } } });
    assert.equal(state.next, 'players');
    assert.equal(state.steps[0].complete, false);
});

test('Americano progress uses saved rotation fixtures and individual entrant counts', () => {
    const rotation = { players: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }], fixtures: [{ id: 'f1', court: 1, scheduled_start: '2026-10-10T08:30:00Z', score: [12, 12] }] };
    const state = divisionWorkflow(division, { draws: [{ ...draw, format: 'americano', status: 'published', scoring_rules: { americano: rotation } }] });
    assert.equal(state.teamCount, 4);
    assert.equal(state.entryUnit, 'players');
    assert.equal(state.scheduled, 1);
    assert.equal(state.finished, 1);
    assert.equal(state.resultsTotal, 1);
    assert.equal(state.next, 'run');
    assert.equal(state.steps[2].complete, true);
});
test('Team Americano reports teams and resumes unpublished rotation at scheduling', () => {
    const rotation = { variant: 'team', players: Array.from({ length: 8 }, (_, id) => ({ id })), teams: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }], fixtures: [{ id: 'f1', court: 1 }] };
    const state = divisionWorkflow(division, { reviews: data.reviews, draws: [{ ...draw, format: 'americano', scoring_rules: { americano: rotation } }] });
    assert.equal(state.teamCount, 4);
    assert.equal(state.entryUnit, 'teams');
    assert.equal(state.next, 'schedule');
    assert.equal(state.steps[2].complete, false);
});
