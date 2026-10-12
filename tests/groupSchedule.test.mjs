import test from 'node:test';
import assert from 'node:assert/strict';
import {generateGroupStageDraft} from '../src/utils/nativeDrawGenerator.js';
import {scheduleMatchesAcrossPlayDays} from '../src/utils/nativeDrawScheduler.js';
import {validateScheduleChanges} from '../src/utils/drawScheduleBoard.js';

test('32 mens pairs: group knockout draft schedules all 48 group fixtures across saved days', () => {
    const entries = Array.from({length:32}, (_,i) => ({id:String(i), source_registration_id:String(i),team_name:`Pair ${i}`}));
    const draft = generateGroupStageDraft(entries, {groupCount:8,format:'group_knockout',advancersPerGroup:2});
    const matches = draft.matches.filter(m=>m.entry_one && m.entry_two).map((m,i)=>({...m,id:`m${i}`,status:'pending',entry_one_id:m.entry_one.source_registration_id,entry_two_id:m.entry_two.source_registration_id}));
    const playDays = ['2026-09-11','2026-09-13','2026-09-20'].map(play_date=>({play_date,start_time:'08:00:00',end_time:'18:00:00',courts_count:4,match_duration_minutes:60,minimum_break_minutes:10,is_active:true}));
    const updates = scheduleMatchesAcrossPlayDays({matches,playDays});
    assert.equal(updates.length,48);
    assert.equal(updates[0].scheduled_start,'2026-09-11T06:00:00.000Z');
    assert.ok(new Set(updates.map(m=>m.scheduled_start.slice(0,10))).size>1);
    assert.deepEqual(validateScheduleChanges({matches,entries,playDays,changes:Object.fromEntries(updates.map(({id,...values})=>[id,values]))}),[]);
    assert.throws(()=>scheduleMatchesAcrossPlayDays({matches,playDays:[{...playDays[0],end_time:'09:00'}]}), /Not enough court time/);
});
test('automation respects per-match extra time and not-before across play days', () => {
    const playDays=['2026-09-11','2026-09-13'].map(play_date=>({play_date,start_time:'08:00',end_time:'18:00',courts_count:1,match_duration_minutes:60,minimum_break_minutes:10,is_active:true}));
    const matches=[{id:'a',entry_one_id:'1',entry_two_id:'2',match_duration_minutes:90,not_before:'2026-09-13T08:00:00Z'}, {id:'b',entry_one_id:'3',entry_two_id:'4',not_before:'2026-09-13T08:00:00Z'}];
    const updates=scheduleMatchesAcrossPlayDays({matches,playDays});
    assert.equal(updates[0].scheduled_start,'2026-09-13T08:00:00.000Z');
    assert.equal(updates[0].scheduled_end,'2026-09-13T09:30:00.000Z');
    assert.equal(updates[1].scheduled_start,'2026-09-13T09:30:00.000Z');
    assert.throws(()=>scheduleMatchesAcrossPlayDays({matches:[{...matches[0],scheduled_start:'2026-09-13T07:00:00Z'}],playDays}),/Not enough court time/);
});
