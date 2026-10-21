import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleTournament } from '../../sandbox/tournament-manager/data.js';
import { generateTournamentSchedule, tournamentFixtures, localTime, localDay, scheduleIssues } from '../../src/utils/tournament/scheduling.js';
import { generateDivisionDraw } from '../../src/utils/tournament/draws.js';
import { tournamentWorkflow } from '../../src/utils/tournament/workflow.js';

test('all divisions must be published before auto scheduling', () => {
 const d=sampleTournament(); d.draws[1].status='draft';
 assert.throws(()=>generateTournamentSchedule(d,d.settings),/publish/);
});
test('whole tournament fits, with requested final programme and no conflicts', () => {
 const d=sampleTournament(), p=generateTournamentSchedule(d,d.settings);
 assert.equal(Object.keys(p.assignments).length,21);
 assert.deepEqual(scheduleIssues({...p,playDays:d.playDays}),[]);
 for(const f of p.fixtures.filter(f=>f.final)) {
  const a=p.assignments[f.id],role=d.settings.divisionRoles[f.division_id];
  assert.equal(localDay(a.scheduled_start),'2026-10-23');
  assert.equal(localTime(a.scheduled_start),role==='mens_open'?'18:00':'17:00');
  assert.equal(a.court_name,role==='mens_advanced'?'Court 2':'Court 1');
 }
});
test('impossible centre-court programme is not silently moved',()=>{
 const d=sampleTournament();d.playDays.at(-1).end_time='18:00';
 assert.throws(()=>generateTournamentSchedule(d,d.settings),/finals programme has not been moved/);
});
test('valid manually pinned bookings survive regeneration',()=>{
 const d=sampleTournament(),p=generateTournamentSchedule(d,d.settings),f=p.fixtures.find(f=>f.round_number===1);
 const pin={...p.assignments[f.id],pinned:true};
 assert.deepEqual(generateTournamentSchedule(d,d.settings,{[f.id]:pin}).assignments[f.id],pin);
});
test('inactive divisions do not add matches to scheduling',()=>{
 const d=sampleTournament();d.divisions[2].is_active=false;d.draws[2].status='draft';
 assert.equal(generateTournamentSchedule(d,d.settings).fixtures.length,14);
});
test('other finals can use a single centre court',()=>{
 const d=sampleTournament();d.divisions=d.divisions.slice(0,1);d.divisions[0].name='Mixed Open';d.settings.divisionRoles={[d.divisions[0].id]:'other'};d.playDays.forEach(day=>day.courts_count=1);
 assert.equal(localTime(Object.values(generateTournamentSchedule(d,d.settings).assignments).at(0).scheduled_start),'17:00');
});
test('group matches have unique identities and elimination capacity is reserved',()=>{
 const d=sampleTournament(),v=d.divisions[0],c=d.confirmations[0];
 const draft=generateDivisionDraw(d,v.id,{format:'group_knockout',groups:2,advancers:2},c.review);
 assert.equal(new Set(draft.matches.map(m=>m.id)).size,draft.matches.length);
 assert.equal(new Set(draft.matches.map(m=>m.key)).size,draft.matches.length);
 const draw=d.draws[0];Object.assign(draw,{format:'group_knockout',group_count:2,advancers_per_group:2});
 d.matches=[...d.matches.filter(m=>m.draw_id!==draw.id),...draft.matches.map(m=>({...m,draw_id:draw.id}))];
 d.entries=[...d.entries.filter(e=>e.draw_id!==draw.id),...draft.entries.map(e=>({...e,draw_id:draw.id}))];
 const fs=tournamentFixtures(d).filter(f=>f.draw_id===draw.id);
 assert.equal(fs.filter(f=>f.virtual).length,3);
 d.matches.filter(m=>m.draw_id===draw.id).forEach(m=>m.status='completed');
 assert.equal(tournamentWorkflow(d).rows[0].complete,false);
});

test('shared players across divisions cannot be double booked in the finals',()=>{
 const d=sampleTournament(),one=d.entries.find(e=>e.draw_id===d.draws[0].id),two=d.entries.find(e=>e.draw_id===d.draws[2].id);
 two.player_one_id=one.player_one_id;two.snapshot.registration_email=one.snapshot.registration_email;
 assert.throws(()=>generateTournamentSchedule(d,d.settings),/Cannot place.*final/);
});
test('earliest-start restrictions are honored without moving finals',()=>{
 const d=sampleTournament(),first=d.matches.find(m=>m.round_number===1);
 first.not_before='2026-10-22T06:00:00Z';
 const p=generateTournamentSchedule(d,d.settings);
 assert.ok(Date.parse(p.assignments[first.id].scheduled_start)>=Date.parse(first.not_before));
});
test('final roles cannot be accidentally assigned to two active divisions',()=>{
 const d=sampleTournament();d.settings.divisionRoles[d.divisions[1].id]='ladies_open';
 assert.throws(()=>generateTournamentSchedule(d,d.settings),/only one active division/);
});

test('division final overrides resolve shared-player finals without moving other anchors',()=>{
 const d=sampleTournament(),one=d.entries.find(e=>e.draw_id===d.draws[0].id),two=d.entries.find(e=>e.draw_id===d.draws[2].id);
 two.player_one_id=one.player_one_id;two.snapshot.registration_email=one.snapshot.registration_email;
 d.settings.divisionFinalTimes={[d.divisions[2].id]:'15:50'};
 const p=generateTournamentSchedule(d,d.settings);
 const advanced=p.fixtures.find(f=>f.final&&f.division_id===d.divisions[2].id);
 assert.equal(localTime(p.assignments[advanced.id].scheduled_start),'15:50');
 assert.deepEqual(scheduleIssues({...p,playDays:d.playDays}),[]);
});
test('division duration overrides retain explicit match minimums',()=>{
 const d=sampleTournament();d.settings.divisionDurations={[d.divisions[0].id]:20};
 const first=d.matches.find(m=>m.draw_id===d.draws[0].id&&m.round_number===1);first.match_duration_minutes=45;
 const p=generateTournamentSchedule(d,d.settings);
 const elapsed=id=>(Date.parse(p.assignments[id].scheduled_end)-Date.parse(p.assignments[id].scheduled_start))/60000;
 assert.equal(elapsed(first.id),45);
 const final=p.fixtures.find(f=>f.final&&f.division_id===d.divisions[0].id);assert.equal(elapsed(final.id),20);
});
