import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKnockoutDraft} from '../src/utils/nativeDrawGenerator.js';
import {planningMatches} from '../src/utils/drawPlanning.js';
import {scheduleMatchesAcrossPlayDays} from '../src/utils/nativeDrawScheduler.js';
import {validateScheduleChanges} from '../src/utils/drawScheduleBoard.js';

const playDays=['2026-09-11','2026-09-12','2026-09-13'].map(play_date=>({play_date,start_time:'08:00',end_time:'20:00',courts_count:4,match_duration_minutes:60,minimum_break_minutes:10,is_active:true}));
function division(id,count) {
 const entries=Array.from({length:count},(_,i)=>({id:`${id}-e${i}`,source_registration_id:`${id}-e${i}`,team_name:`${id} Team ${i+1}`}));
 const draft=generateKnockoutDraft(entries,{placementPlayoff:'none'});
 const rows=draft.matches.map(m=>({...m,id:`${id}-${m.key}`,draw_id:id,draws:{division_id:id},entry_one_id:m.entry_one?.source_registration_id,entry_two_id:m.entry_two?.source_registration_id}));
 for(const row of rows) row.source_slots.forEach((source,i)=>{if(source.source_match_key){const feeder=rows.find(m=>m.key===source.source_match_key);feeder.winner_to_match_id=row.id;feeder.winner_to_slot=i+1;}});
 return {rows,entries};
}
for(const sizes of [[32,16,8],[25,12,5]]) test(`all divisions schedule automatically with team counts ${sizes}`,()=>{
 const divisions=sizes.map((n,i)=>division(`division${i}`,n));
 const rows=planningMatches(divisions.flatMap(d=>d.rows));
 const matches=rows.filter(m=>m.status==='pending').map(m=>({...m,align_final:!m.winner_to_match_id,planned_play_date:!m.winner_to_match_id?'2026-09-13':null})).reverse();
 const updates=scheduleMatchesAcrossPlayDays({matches,playDays,existingMatches:rows.filter(m=>m.status!=='pending')});
 const booked=rows.map(m=>({...m,...updates.find(u=>u.id===m.id)}));
 assert.equal(updates.length,matches.length);
 for(const {rows:draw} of divisions) {
  const rounds=[...new Set(draw.map(m=>m.round_number))];
  for(const round of rounds.slice(1)) {
   const previous=booked.filter(m=>m.draw_id===draw[0].draw_id&&m.round_number===round-1&&m.scheduled_end);
   const next=booked.filter(m=>m.draw_id===draw[0].draw_id&&m.round_number===round&&m.scheduled_start);
   assert.ok(Math.min(...next.map(m=>Date.parse(m.scheduled_start)))>=Math.max(...previous.map(m=>Date.parse(m.scheduled_end)))+600000);
  }
 }
 const finals=booked.filter(m=>!m.winner_to_match_id);
 assert.ok(finals.every(m=>m.scheduled_start.startsWith('2026-09-13')));
 assert.equal(new Set(finals.map(m=>m.scheduled_start)).size,1);
 assert.deepEqual(validateScheduleChanges({matches:rows,entries:divisions.flatMap(d=>d.entries),playDays,changes:Object.fromEntries(updates.map(({id,...v})=>[id,v]))}),[]);
});
test('next round waits for other matches in the feeder round, even on a free court',()=>{
 const {rows}=division('men',8);
 const planned=planningMatches(rows);
 const quarter=planned.find(m=>m.round_number===2);
 assert.equal(quarter.dependency_ids.length,4);
 const opening=planned.filter(m=>m.round_number===1).map((m,i)=>({...m,not_before:i===3?'2026-09-12T06:00:00Z':null}));
 const updates=scheduleMatchesAcrossPlayDays({matches:[quarter,...opening],playDays});
 assert.ok(updates.find(m=>m.id===quarter.id).scheduled_start.startsWith('2026-09-12'));
});
