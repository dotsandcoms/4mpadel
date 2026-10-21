import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchRankedinPointSnapshot, resolveResultIdentity, fetchTrophyHistories, countTournamentWins, refreshResultRanking } from '../src/utils/rankedinResults.js';

const event = (name, date, points, id, place = 1, type = 4) => ({ EventName: name, EventUrl: `/en/tournament/${id}/event`, EventPoint: { Date: date, EventName: `${name} | Class: Men's Open`, Points: points, Standing: place, EventType: type } });
const rows = [
  event('Growthpoint SA Nationals 2026 - Open','18/10/2026',2600,75314),
  event('The Cape Town Open- CHANGAN SA GRAND TOUR','20/09/2026',1500,74466),
  event('The Pretoria Major','16/08/2026',2600,3),
  event('SA Grand Open - SAPA 1500 Super Gold','05/07/2026',900,4,2),
  event('SAPA 1000 GOLD Tournament @ VAPC LONEHILL','21/06/2026',1000,5),
  event('Pretoria P1 Wild Card tournament','14/06/2026',1560,6,2),
  event('Padel 365 SAPA Cape Town Major','19/04/2026',1560,7,2),
  event('BROLL KCC CUP - SAPA 2000 MAJOR JHB','29/03/2026',2600,8),
];
const payload = (events = rows) => ({ ParticipantWithPoints: { Participant: { Id:201351 }, ParticipantPoints: { AgeGroup:82,Points:14320,Standing:1 }, EventPoints: { Payload:events } } });
const response = value => ({ok:true,json:async()=>value});

test('website Best 8 retains all provider results in date order, including September second',async()=>{
  const snapshot=await fetchRankedinPointSnapshot(201351,82,false,async()=>response(payload()));
  assert.equal(snapshot.details.length,8);assert.equal(snapshot.points,14320);assert.equal(snapshot.rank,1);
  assert.equal(snapshot.details[1].date,'20/09/2026');assert.equal(snapshot.details[1].points,1500);
  assert.deepEqual(snapshot.details.map(row=>row.date),rows.map(row=>row.EventPoint.Date));
  assert.equal(snapshot.details.reduce((sum,row)=>sum+row.points,0),14320);
  const proportional=await fetchRankedinPointSnapshot(201351,82,false,async()=>response(payload([...rows,event('League contribution','28/03/2026',10,9,1,3)])));
  assert.equal(proportional.details.length,9);
});

test('fresh results bypass browser caching, coalesce concurrent requests and refresh after completion',async()=>{
  let calls=0;
  const live=async(_url,options)=>{calls++;assert.equal(options.cache,'no-store');return response(payload());};
  await Promise.all([fetchRankedinPointSnapshot(201351,82,false,live),fetchRankedinPointSnapshot(201351,82,false,live)]);
  assert.equal(calls,1);await fetchRankedinPointSnapshot(201351,82,false,live);assert.equal(calls,2);
});

test('all histories paginate and provider failures cannot masquerade as empty results',async()=>{
  const urls=[];
  const all=await fetchRankedinPointSnapshot(201351,82,true,async url=>{urls.push(url);return response(payload(urls.length===1?Array.from({length:100},()=>rows[0]):[rows[1]]));});
  assert.equal(all.details.length,101);assert.match(urls[1],/skip=100/);
  for(const live of [async()=>({ok:false,status:503}),async()=>response({}),async()=>{throw new Error('offline');}])await assert.rejects(fetchRankedinPointSnapshot(201351,82,false,live));
});

test('participant and category mismatches are rejected',async()=>{
  await assert.rejects(fetchRankedinPointSnapshot(999,82,false,async()=>response(payload())),/different participant/);
  await assert.rejects(fetchRankedinPointSnapshot(201351,83,false,async()=>response(payload())),/different category/);
});

test('missing IDs recover through the exact RankedIn identity without name substitution',async()=>{
  const ranking={org:'SAPA ranking',age_group_id:82,ranking_type:3};
  const live=async url=>{assert.match(url,/rankingId=15809&rankingType=3&ageGroup=82/);return response({Payload:[{Name:'Same name',RankedinId:'Rwrong',Participant:{Id:10}},{Name:'Same name',RankedinId:'R000258011',Participant:{Id:201351}}]});};
  assert.equal((await resolveResultIdentity(ranking,'R000258011',live)).participant,'201351');
  await assert.rejects(resolveResultIdentity(ranking,'Rmissing',live),/not linked/);
});

test('trophies use full histories across organisations and classify duplicate calendar rows correctly',async()=>{
  const live=async url=>{assert.match(url,/showAll=true/);const data=payload([...rows,event('Uncounted Silver win','01/02/2026',250,9),event('Team league','01/01/2026',200,10,1,3)]);delete data.ParticipantWithPoints.Participant;return response(data);};
  const histories=await fetchTrophyHistories([{org:'SAPA ranking',ranking_participant_id:201351,age_group_id:82,details:[]},{org:'Broll Pro Tour',ranking_participant_id:201436,age_group_id:82}],null,live);
  const counts=countTournamentWins(histories,[{rankedin_id:75314,sapa_status:'Major'},{rankedin_id:74466,sapa_status:'None'},{rankedin_id:74466,sapa_status:'Super Gold'}]);
  assert.deepEqual(counts,{Major:3,'Super Gold':1,Gold:1,Silver:1});
});

test('refreshing a saved ranking updates its total and details without changing the input',async()=>{
  const saved={org:'SAPA ranking',ranking_participant_id:201351,age_group_id:82,points:'12620',details:[]};
  const fresh=await refreshResultRanking(saved,'R000258011',false,async()=>response(payload()));
  assert.equal(fresh.points,14320);assert.equal(fresh.details[1].date,'20/09/2026');assert.equal(saved.points,'12620');assert.equal(saved.details.length,0);
});
