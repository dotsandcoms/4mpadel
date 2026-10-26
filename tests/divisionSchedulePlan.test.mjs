import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKnockoutDraft } from '../src/utils/nativeDrawGenerator.js';
import { routeIds, resolveDrawRoutes } from '../src/utils/drawBackplates.js';
import { planningMatches } from '../src/utils/drawPlanning.js';
import { scheduleMatchesAcrossPlayDays } from '../src/utils/nativeDrawScheduler.js';
import { validateScheduleChanges, scheduleDay, scheduleTime } from '../src/utils/drawScheduleBoard.js';
import { createDailyRoundCounter, createSchedulePlayerOverlap, orderedScheduleDivisions, validateDivisionSchedulePlan } from '../src/utils/divisionSchedulePlan.js';

const days = [
    { play_date: '2026-10-10', start_time: '08:30', end_time: '16:00' },
    { play_date: '2026-10-11', start_time: '09:00', end_time: '15:00' },
].map(day => ({ ...day, courts_count: 10, match_duration_minutes: 90, minimum_break_minutes: 90, is_active: true }));
const plan = { schedule_days: { '2026-10-10': { rounds: 2, start_time: '08:30' }, '2026-10-11': { rounds: '', start_time: '09:00' } } };
function draw(id, count, placementPlayoff = 'top8') {
    const entries = Array.from({ length: count }, (_, i) => ({ id: `${id}-e${i}`, source_registration_id: `${id}-r${i}`, team_name: `${id} Team ${i + 1}` }));
    const draft = generateKnockoutDraft(entries, { plateMode: 'triple', placementPlayoff });
    const routes = routeIds(draft.matches, m => `${id}-${m.key}`);
    const matches = planningMatches(resolveDrawRoutes(draft.matches.map(m => ({ ...m, id: `${id}-${m.key}`, draw_id: id, draws: { division_id: id }, entry_one_id: m.entry_one?.id || null, entry_two_id: m.entry_two?.id || null, winner_entry_id: m.winner?.id || null, ...routes.get(m.key) }))));
    return { entries, matches };
}

test('SA Nationals 8- and 14-team draws fit the Saturday and Sunday settings, with two player rounds on Saturday', () => {
    const draws = [draw('men35', 8, 'top4'), draw('men45', 14)];
    const matches = draws.flatMap(draw => draw.matches);
    const candidates = matches.filter(m => m.status === 'pending' && m.can_plan).map(match => ({ ...match,
        align_final: match.stage === 'knockout' && !match.winner_to_match_id,
        planned_play_date: match.stage === 'knockout' && !match.winner_to_match_id ? '2026-10-11' : null,
    }));
    const divisionConfigs = { men35: plan, men45: plan };
    const updates = scheduleMatchesAcrossPlayDays({ matches: candidates, existingMatches: matches.filter(m => !candidates.some(c => c.id === m.id)), playDays: days, divisionConfigs });
    assert.equal(updates.length, 36); // 12 for Men 35+, 24 for Men 45+, excluding automatic byes.
    const booked = matches.map(match => ({ ...match, ...updates.find(update => update.id === match.id) }));
    const counter = createDailyRoundCounter(matches);
    for (const id of ['men35', 'men45']) assert.equal(counter(booked, '2026-10-10', id), 2);
    assert.ok(updates.some(update => scheduleDay(update.scheduled_start) === '2026-10-11'));
    assert.ok(updates.filter(update => scheduleDay(update.scheduled_start) === '2026-10-11').every(update => scheduleTime(update.scheduled_start) >= '09:00' && scheduleTime(update.scheduled_end) <= '15:00'));
    const changes = Object.fromEntries(updates.map(({ id, ...values }) => [id, values]));
    assert.deepEqual(validateScheduleChanges({ matches, entries: draws.flatMap(draw => draw.entries), playDays: days, divisionConfigs, divisions: [{ id: 'men35', name: 'Men 35+' }, { id: 'men45', name: 'Men 45+' }], changes }), []);
});

test('mutually exclusive main and plate paths use the longest route, while byes use no round', () => {
    const { matches } = draw('men45', 14);
    const booked = matches.map(match => ({ ...match, scheduled_start: '2026-10-10T06:30:00Z' }));
    assert.equal(createDailyRoundCounter(matches)(booked, '2026-10-10', 'men45'), 4);
    const opening = booked.filter(match => match.stage === 'knockout' && match.round_number === 1);
    assert.equal(createDailyRoundCounter(opening)(opening, '2026-10-10', 'men45'), 1);
    const byes = opening.filter(match => match.result_type === 'walkover');
    assert.equal(byes.length, 2);
    assert.equal(createDailyRoundCounter(byes)(byes, '2026-10-10', 'men45'), 0);
});

test('independent round-robin fixtures count every appearance, including existing bookings', () => {
    const base = { draw_id: 'rr', draws: { division_id: 'rr' }, possible_entry_ids: ['a'], status: 'pending' };
    const matches = [1, 2, 3].map(id => ({ ...base, id: `m${id}`, entry_one_id: 'a', entry_two_id: `b${id}` }));
    const existing = [{ ...matches[0], scheduled_start: '2026-10-10T06:30:00Z', scheduled_end: '2026-10-10T08:00:00Z', court_name: 'Court 1' }];
    const updates = scheduleMatchesAcrossPlayDays({ matches: matches.slice(1), existingMatches: existing, playDays: days, divisionConfigs: { rr: plan } });
    assert.equal(scheduleDay(updates[0].scheduled_start), '2026-10-10');
    assert.equal(scheduleDay(updates[1].scheduled_start), '2026-10-11');
});

test('zero rounds skips a day, division starts apply daily, and a fixed date cannot bypass the limit', () => {
    const match = { id: 'm', draws: { division_id: 'x' }, status: 'pending', entry_one_id: 'a', entry_two_id: 'b' };
    const divisionConfigs = { x: { schedule_days: { '2026-10-10': { rounds: 0 }, '2026-10-11': { start_time: '10:00' } } } };
    const [update] = scheduleMatchesAcrossPlayDays({ matches: [match], playDays: days, divisionConfigs });
    assert.equal(scheduleDay(update.scheduled_start), '2026-10-11');
    assert.equal(scheduleTime(update.scheduled_start), '10:00');
    assert.throws(() => scheduleMatchesAcrossPlayDays({ matches: [{ ...match, planned_play_date: '2026-10-10' }], playDays: days, divisionConfigs }), /daily round limits/);
});

test('manual moves cannot exceed the player round cap or start before the division', () => {
    const matches = [1, 2, 3].map(i => ({ id: `m${i}`, status: 'pending', entry_one_id: 'a', entry_two_id: `b${i}`, draws: { division_id: 'x' }, court_name: `Court ${i}`, scheduled_start: `2026-10-10T${['06:30', '09:30', '12:30'][i - 1]}:00Z`, scheduled_end: `2026-10-10T${['08:00', '11:00', '14:00'][i - 1]}:00Z` }));
    const errors = validateScheduleChanges({ matches, entries: [], playDays: days, divisions: [{ id: 'x', name: 'Men 45+' }], divisionConfigs: { x: { ...plan, schedule_days: { ...plan.schedule_days, '2026-10-10': { rounds: 2, start_time: '09:00' } } } }, changes: { m1: { court_name: 'Court 4' } } });
    assert.ok(errors.some(error => error.includes('daily limit is 2')));
    assert.ok(errors.some(error => error.includes('starts from 09:00')));
});

test('division priority and validation survive saved workflow configuration', () => {
    const divisions = ['men35', 'men45', 'ladies50', 'men55'].map(id => ({ id, name: id }));
    const configs = { men55: { ...plan, schedule_priority: 0 }, ladies50: { ...plan, schedule_priority: 1 }, men35: { ...plan, schedule_priority: 2 }, men45: { ...plan, schedule_priority: 3 } };
    assert.deepEqual(orderedScheduleDivisions(divisions, JSON.parse(JSON.stringify(configs))).map(d => d.id), ['men55', 'ladies50', 'men35', 'men45']);
    assert.doesNotThrow(() => validateDivisionSchedulePlan(configs, divisions, days));
    assert.throws(() => validateDivisionSchedulePlan({ men35: { schedule_days: { '2026-10-10': { rounds: -1 } } } }, divisions, days), /whole number/);
    assert.throws(() => validateDivisionSchedulePlan({ men35: { schedule_days: { '2026-10-10': { start_time: '16:00' } } } }, divisions, days), /playing hours/);
});

test('winner and loser branches can share a time, while either branch still conflicts with its feeder', () => {
    const matches = [
        { id: 'quarter', possible_entry_ids: ['a', 'b'], winner_to_match_id: 'main', loser_to_match_id: 'plate' },
        { id: 'main', possible_entry_ids: ['a', 'b'] },
        { id: 'plate', possible_entry_ids: ['a', 'b'] },
        { id: 'other-division', possible_entry_ids: ['a'] },
    ];
    const overlaps = createSchedulePlayerOverlap(matches);
    assert.equal(overlaps(matches[1], matches[2]), false);
    assert.equal(overlaps(matches[0], matches[1]), true);
    assert.equal(overlaps(matches[0], matches[2]), true);
    assert.equal(overlaps(matches[1], matches[3]), true);
});

test('future plate BYEs need no court and later played matches retain their real dependencies', () => {
    const { matches } = draw('men45', 14);
    const automatic = matches.filter(m => m.stage === 'placement' && !m.can_plan);
    assert.equal(automatic.length, 4);
    assert.ok(automatic.every(m => m.is_automatic_bye));
    for (const match of matches.filter(m => m.can_plan)) {
        assert.ok(match.dependency_ids.every(id => matches.find(m => m.id === id).can_plan));
    }
    const candidates = matches.filter(m => m.can_plan && m.status === 'pending').reverse();
    const updates = scheduleMatchesAcrossPlayDays({ matches: candidates, existingMatches: matches.filter(m => !candidates.includes(m)), playDays: days, divisionConfigs: { men45: plan } });
    assert.equal(updates.length, 24);
    assert.deepEqual(validateScheduleChanges({ matches, entries: [], playDays: days, changes: Object.fromEntries(updates.map(({id, ...values}) => [id, values])) }), []);
});
