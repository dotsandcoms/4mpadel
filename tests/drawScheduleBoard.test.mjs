import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleDateLabel, scheduleDay, scheduleTime, scheduleTimestamp, validateScheduleChanges } from '../src/utils/drawScheduleBoard.js';

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
    assert.match(check([], assignment(), { matches: [{ ...match, status: 'in_progress' }] }).join(), /already in progress/);
});
test('validates the final preview rather than old positions', () => {
    const other = { id: 'two', status: 'scheduled', entry_one_id: 'd', entry_two_id: 'e', ...assignment() };
    assert.deepEqual(check([other], assignment(), { changes: { one: assignment(), two: assignment('Court 2') } }), []);
});
test('blocks unscheduled next-round placeholders', () => {
    assert.match(check([], assignment(), { matches: [{ ...match, entry_two_id: null }] }).join(), /team slot 2 has neither an entrant nor a linked earlier match/);
});
test('not-before time blocks early placement and accepts the boundary', () => {
    const not_before = new Date(scheduleTimestamp('2026-09-04','10:30')).toISOString();
    assert.match(check([], {...assignment(),not_before}).join(), /cannot start before/);
    assert.deepEqual(check([], {...assignment('Court 3','10:30','11:30'),not_before}), []);
});
test('duration-only edits validate the merged booking against neighbouring matches', () => {
    const booked = {...match,...assignment('Court 3','10:00','11:00')};
    const other = {id:'two',status:'scheduled',entry_one_id:'d',entry_two_id:'e',...assignment('Court 3','11:00','12:00')};
    const errors=validateScheduleChanges({matches:[booked,other],entries,playDays,changes:{one:{match_duration_minutes:90,scheduled_end:assignment('Court 3','10:00','11:30').scheduled_end}}});
    assert.match(errors.join(), /two matches overlap/);
});


test('date choices include weekday and year without depending on local timezone', () => {
    assert.equal(scheduleDateLabel('2026-09-11'), 'Fri, 11 Sept 2026');
    assert.match(scheduleDateLabel('2026-09-12'), /^Sat,/);
    assert.match(scheduleDateLabel('2026-09-13'), /^Sun,/);
});
test('readiness conflicts identify the division, round and match', () => {
    const errors = check([], assignment(), {matches:[{...match,draws:{division_id:'ladies'},round_label:'Quarterfinals',bracket_position:3,status:'walkover'}],divisions:[{id:'ladies',name:'Ladies Open'}]});
    assert.match(errors[0], /Ladies Open · Quarterfinals · Match 3: recorded as a walkover/);
});
test('removed match keeps its previous description in the conflict', () => {
    const errors = check([], assignment(), {matches:[],previousMatches:[{...match,round_label:'Final',bracket_position:1}]});
    assert.match(errors[0], /Final · Match 1: this match no longer exists/);
});
test('future round with linked feeders can be scheduled before results are known', () => {
    const feeders = [{...match,id:'feed1',winner_to_match_id:'final',winner_to_slot:1,...assignment('Court 1','08:00','09:00')},
        {...match,id:'feed2',entry_one_id:'d',entry_two_id:'e',winner_to_match_id:'final',winner_to_slot:2,...assignment('Court 2','08:00','09:00')}];
    assert.deepEqual(check([], assignment(), {matches:[...feeders,{id:'final',status:'pending'}],changes:{final:assignment()}}), []);
});
test('court conflicts identify both matches and the date', () => {
    const errors = check([{id:'two',round_label:'Final',bracket_position:1,status:'scheduled',...assignment(),entry_one_id:'d'}]);
    assert.match(errors.join(), /Match one and Final · Match 1: two matches overlap on Court 3, Fri, 4 Sept 2026/);
});
