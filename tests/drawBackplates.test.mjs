import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKnockoutDraft} from '../src/utils/nativeDrawGenerator.js';
import {routeIds,resolveDrawRoutes} from '../src/utils/drawBackplates.js';
import {planningMatches} from '../src/utils/drawPlanning.js';
import {scheduleMatchesAcrossPlayDays} from '../src/utils/nativeDrawScheduler.js';
import {validateScheduleChanges} from '../src/utils/drawScheduleBoard.js';
const entries=n=>Array.from({length:n},(_,i)=>({id:`e${i}`,source_registration_id:`e${i}`,team_name:`Pair ${i+1}`}));
const saved=draw=>{const routes=routeIds(draw.matches,m=>m.key);return draw.matches.map(m=>({...m,id:m.key,entry_one_id:m.entry_one?.id||null,entry_two_id:m.entry_two?.id||null,winner_entry_id:m.winner?.id||null,...routes.get(m.key)}));};
for(const mode of ['double','triple','all']) test(`32-pair ${mode} includes initial placement placeholders and unique routes`,()=>{
 const draw=generateKnockoutDraft(entries(32),{plateMode:mode,placementPlayoff:'top4'});
 const codes=new Set(draw.matches.map(m=>m.round_code.replace(/_r\d+$/,'')));
 assert.ok(codes.has('places_17_32'));
 if(mode!=='double') assert.ok(codes.has('places_25_32'));
 if(mode==='all'){assert.ok(codes.has('places_9_16'));assert.ok(codes.has('places_3_4'));assert.equal(draw.matches.length,80);}
 assert.equal(new Set(draw.matches.map(m=>`${m.stage}:${m.round_number}:${m.bracket_position}`)).size,draw.matches.length);
 const routes=saved(draw);
 for(const m of routes) for(const result of ['winner','loser']) if(m[`${result}_to_match_id`]) assert.ok(routes.some(t=>t.id===m[`${result}_to_match_id`]));
});
for(const n of [4,8,17,32]) test(`full placement resolves ${n} entrants including byes without stuck matches`,()=>{
 let matches=resolveDrawRoutes(saved(generateKnockoutDraft(entries(n),{plateMode:'all'})));
 for(let i=0;i<300;i++){
  const ready=matches.find(m=>m.status==='pending'&&m.entry_one_id&&m.entry_two_id);
  if(!ready) break;
  ready.winner_entry_id=ready.entry_one_id;ready.loser_entry_id=ready.entry_two_id;ready.status='completed';
  matches=resolveDrawRoutes(matches);
 }
 assert.ok(matches.every(m=>['completed','walkover','cancelled'].includes(m.status)));
 assert.ok(matches.every(m=>!m.winner_entry_id||m.winner_entry_id===m.entry_one_id||m.winner_entry_id===m.entry_two_id));
});
test('unresolved placements schedule after feeders and validate potential-player rest',()=>{
 const base=saved(generateKnockoutDraft(entries(8),{plateMode:'all'}));
 const matches=planningMatches(base);
 const playDays=[{play_date:'2026-09-20',start_time:'08:00',end_time:'23:00',courts_count:4,match_duration_minutes:15,minimum_break_minutes:5,is_active:true}];
 assert.ok(matches.every(m=>m.can_plan));
 const updates=scheduleMatchesAcrossPlayDays({matches,playDays});
 const changes=Object.fromEntries(updates.map(({id,...v})=>[id,v]));
 assert.deepEqual(validateScheduleChanges({matches:base,entries:entries(8),playDays,changes}),[]);
 const plate=matches.find(m=>m.round_code.startsWith('places_'));
 changes[plate.id]={...changes[plate.id],scheduled_start:updates[0].scheduled_start,scheduled_end:updates[0].scheduled_end};
 assert.ok(validateScheduleChanges({matches:base,entries:entries(8),playDays,changes}).some(e=>/feeder|rest/.test(e)));
});

test('unplayed quarterfinals, semifinals and final can be planned on three separate days',()=>{
 const base=saved(generateKnockoutDraft(entries(8),{}));
 const dates=['2026-09-11','2026-09-13','2026-09-20'];
 const playDays=dates.map(play_date=>({play_date,start_time:'08:00',end_time:'18:00',courts_count:4,match_duration_minutes:60,minimum_break_minutes:10,is_active:true}));
 const matches=planningMatches(base).map(m=>({...m,planned_play_date:dates[m.round_number-1],not_before:m.round_number===3?'2026-09-20T12:00:00+02:00':null}));
 const updates=scheduleMatchesAcrossPlayDays({matches,playDays});
 for(const update of updates){
  const source=matches.find(m=>m.id===update.id);
  assert.equal(new Date(Date.parse(update.scheduled_start)+7200000).toISOString().slice(0,10),source.planned_play_date);
 }
 assert.ok(Date.parse(updates.at(-1).scheduled_start)>=Date.parse('2026-09-20T12:00:00+02:00'));
 assert.deepEqual(validateScheduleChanges({matches:base,entries:entries(8),playDays,changes:Object.fromEntries(updates.map(({id,...values})=>[id,values]))}),[]);
 assert.ok(matches.filter(m=>m.round_number>1).every(m=>!m.entry_one_id&&!m.entry_two_id));
});

test('round date does not silently overflow to a different day',()=>{
 const playDays=['2026-09-11','2026-09-13'].map(play_date=>({play_date,start_time:'08:00',end_time:'09:00',courts_count:1,match_duration_minutes:60,minimum_break_minutes:10,is_active:true}));
 assert.throws(()=>scheduleMatchesAcrossPlayDays({playDays,matches:[{id:'a',planned_play_date:'2026-09-11'},{id:'b',planned_play_date:'2026-09-11'}]}),/Not enough court time/);
});
