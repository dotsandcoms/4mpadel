import test from 'node:test';
import assert from 'node:assert/strict';
import { addEventPlayDay, buildEventPlayDays, mergeEventPlayDays } from '../src/utils/nativeDrawScheduler.js';
const event = {start_date:'2026-09-20',end_date:'2026-09-20',courts_count:4};
test('additional days copy settings without copying a persisted ID', () => {
    const days=buildEventPlayDays(event);days[0].id='old';days[0].end_time='21:00';
    const added=addEventPlayDay(days,'2026-09-22',event);
    assert.equal(added.length,2);assert.equal(added[1].end_time,'21:00');assert.equal(added[1].id,undefined);
    assert.equal(days.length,1);
});
test('reloading retains saved days outside the event dates',()=>{
    const defaults=buildEventPlayDays(event);
    const saved=addEventPlayDay(defaults,'2026-09-19',event).map(d=>({...d,courts_count:6}));
    const merged=mergeEventPlayDays(defaults,saved);
    assert.deepEqual(merged.map(d=>d.play_date),['2026-09-19','2026-09-20']);
    assert.ok(merged.every(d=>d.courts_count===6));
});
test('duplicate/invalid dates rejected; empty events can get a first day',()=>{
    const days=buildEventPlayDays(event);
    for(const date of ['2026-09-20','2026-02-30','','garbage']) assert.throws(()=>addEventPlayDay(days,date,event));
    assert.equal(addEventPlayDay([],'2026-09-21',{}).length,1);
});

test('removed dates stay hidden after reload and can be added again', () => {
    const defaults=[{play_date:'2026-09-20',start_time:'08:00',end_time:'18:00',courts_count:4,is_active:true}];
    assert.deepEqual(mergeEventPlayDays(defaults,[{...defaults[0],is_removed:true,is_active:false}]),[]);
    const restored=addEventPlayDay([], '2026-09-20', {courts_count:4});
    assert.equal(restored[0].is_removed,false);
    assert.equal(restored[0].is_active,true);
    assert.equal(mergeEventPlayDays(defaults,restored).length,1);
});
