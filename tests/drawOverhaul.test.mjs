import test from 'node:test';
import assert from 'node:assert/strict';
import {scheduleMatchesAcrossPlayDays} from '../src/utils/nativeDrawScheduler.js';
import {generateKnockoutDraft} from '../src/utils/nativeDrawGenerator.js';
import {registrationIssues,reviewFingerprint} from '../src/utils/drawPlayerReview.js';
const days=[{play_date:'2026-09-11',start_time:'08:00',end_time:'18:00',courts_count:2,match_duration_minutes:60,minimum_break_minutes:10,is_active:true}];
const stamp=time=>`2026-09-11T${time}:00+02:00`;
test('a later reserved final does not consume the morning court gap',()=>{
 const updates=scheduleMatchesAcrossPlayDays({playDays:days,matches:[{id:'opening',court_name:'Court 1'}],existingMatches:[{id:'reserved',court_name:'Court 1',scheduled_start:stamp('16:00'),scheduled_end:stamp('17:00')}]});
 assert.equal(Date.parse(updates[0].scheduled_start),Date.parse(stamp('08:00')));
});
test('dependency order takes precedence over an organiser putting finals first',()=>{
 const updates=scheduleMatchesAcrossPlayDays({playDays:days,matches:[{id:'final',dependency_ids:['semi']},{id:'semi'}]});
 assert.equal(updates[0].id,'semi');
 assert.ok(Date.parse(updates[1].scheduled_start)>=Date.parse(updates[0].scheduled_end)+600000);
});
test('main finals align on the last day and overflow follows',()=>{
 const updates=scheduleMatchesAcrossPlayDays({playDays:days,matches:[{id:'earlier'},...['a','b','c'].map(id=>({id,dependency_ids:['earlier'],align_final:true,planned_play_date:'2026-09-11'}))]});
 assert.equal(updates[1].scheduled_start,updates[2].scheduled_start);
 assert.ok(Date.parse(updates[3].scheduled_start)>=Date.parse(updates[1].scheduled_end));
});
test('cannot invent an unscheduled feeder',()=>assert.throws(()=>scheduleMatchesAcrossPlayDays({playDays:days,matches:[{id:'final',dependency_ids:['missing']}]}),/preceding rounds/));
test('selected 13–16 back draw retains prerequisites without unrelated consolation branches',()=>{
 const draft=generateKnockoutDraft(Array.from({length:32},(_,i)=>({id:String(i),team_name:`Team ${i}`,seed_number:i+1})),{plateMode:['places_13_16']});
 const keys=new Set(draft.matches.map(m=>m.key));
 assert.ok(draft.matches.some(m=>m.round_code.startsWith('places_13_16')));
 assert.ok(draft.matches.some(m=>m.round_code.startsWith('places_9_16')));
 assert.ok(!draft.matches.some(m=>m.round_code.startsWith('places_17_32')));
 for(const m of draft.matches) for(const source of m.source_slots||[]) if(source.source_match_key)assert.ok(keys.has(source.source_match_key));
});
test('both pair licences and payment are reviewed; changes invalidate confirmation',()=>{
 const row={id:'1',full_name:'A',email:'a@test',partner_name:'B',partner_email:'b@test',payment_status:'pending'};
 const players=new Map([['a@test',{license_type:'full'}]]);
 assert.deepEqual(registrationIssues(row,players,{id:1}),['Entry payment outstanding','B: licence not verified']);
 assert.notEqual(reviewFingerprint([row],players,{id:1}),reviewFingerprint([{...row,payment_status:'paid'}],players,{id:1}));
});

test('division playing dates constrain automatic assignments even when earlier courts are free',()=>{
 const later={...days[0],play_date:'2026-09-12'};
 const [result]=scheduleMatchesAcrossPlayDays({playDays:[...days,later],matches:[{id:'a',allowed_play_dates:['2026-09-12']}]});
 assert.equal(result.scheduled_start.slice(0,10),'2026-09-12');
 assert.throws(()=>scheduleMatchesAcrossPlayDays({playDays:days,matches:[{id:'a',allowed_play_dates:['2026-09-12']}]}),/Not enough court time/);
});
