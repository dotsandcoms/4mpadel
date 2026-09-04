import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleDay, scheduleTime, scheduleTimestamp, validateScheduleChanges } from '../src/utils/drawScheduleBoard.js';

const playDays = [{ play_date: '2026-09-04', start_time: '08:00', end_time: '18:00', courts_count: 3, match_duration_minutes: 60, minimum_break_minutes: 30, is_active: true }];
const entries = [{ id: 'a', player_one_id: 1 }, { id: 'b', player_one_id: 2 }, { id: 'c', player_one_id: 1 }, { id: 'd', player_one_id: 4 }];
const match = { id: 'one', status: 'pending', entry_one_id: 'a', entry_two_id: 'b' };
const assignment = (court = 'Court 3', start = '10:00', end = '11:00') => ({ court_name: court, scheduled_start: new Date(scheduleTimestamp('2026-09-04', start)).toISOString(), scheduled_end: new Date(scheduleTimestamp('2026-09-04', end)).toISOString() });
const check = (others = [], change = assignment(), overrides = {}) => validateScheduleChanges({ matches: [match, ...others], entries, playDays, changes: { one: change }, ...overrides });

test('uses SAST independently of browser timezone', () => {
    assert.equal(scheduleDay('2026-09-03T23:00:00Z'), '2026-09-04');
    assert.equal(scheduleTime('2026-09-04T08:00:00Z'), '10:00');
});
test('valid placement on Court 3', () => assert.deepEqual(check(), []));
test('rejects court overlap with another division', () => {
    assert.match(check([{ id: 'two', status: 'scheduled', ...assignment(), entry_one_id: 'd' }]).join(), /two matches overlap/);
});
test('same player with a different entry ID cannot overlap on another court', () => {
    assert.match(check([{ id: 'two', status: 'scheduled', ...assignment('Court 2'), entry_one_id: 'c' }]).join(), /Player clash/);
});
test('enforces minimum rest and accepts exact rest boundary', () => {
    const earlier = { id: 'two', status: 'scheduled', ...assignment('Court 2', '09:00', '10:00'), entry_one_id: 'c' };
    assert.match(check([earlier]).join(), /rest/);
    assert.deepEqual(check([earlier], assignment('Court 3', '10:30', '11:30')), []);
});
test('rejects unavailable courts and out-of-hours finishes', () => {
    assert.match(check([], assignment('Court 4')).join(), /available courts/);
    assert.match(check([], assignment('Court 3', '17:30', '18:30')).join(), /playing hours/);
});
test('cannot move started matches', () => {
    assert.match(check([], assignment(), { matches: [{ ...match, status: 'in_progress' }] }).join(), /no longer ready/);
});
test('validates the final preview rather than old positions', () => {
    const other = { id: 'two', status: 'scheduled', entry_one_id: 'd', entry_two_id: 'e', ...assignment() };
    assert.deepEqual(check([other], assignment(), { changes: { one: assignment(), two: assignment('Court 2') } }), []);
});
test('blocks unscheduled next-round placeholders', () => {
    assert.match(check([], assignment(), { matches: [{ ...match, entry_two_id: null }] }).join(), /no longer ready/);
});
