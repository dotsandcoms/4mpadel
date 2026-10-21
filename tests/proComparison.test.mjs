import test from 'node:test';
import assert from 'node:assert/strict';
import { comparisonPlayers, directMeetings } from '../src/utils/proComparison.js';
const players=[{id:66},{id:65},{id:115}];
const match={id:1,playedAt:'2026-09-13',status:'finished',winner:'team_1',round:1,teams:[[{id:66},{id:65}],[{id:115},{id:114}]]};

test('comparison selects distinct current-category players even for invalid or duplicate links',()=>{
 assert.deepEqual(comparisonPlayers(players,'66','115').map(p=>p.id),[66,115]);
 assert.deepEqual(comparisonPlayers(players,'66','66').map(p=>p.id),[66,65]);
 assert.deepEqual(comparisonPlayers(players,'invalid','missing').map(p=>p.id),[66,65]);
 assert.deepEqual(comparisonPlayers([{id:1},{id:2}],'66','115').map(p=>p.id),[1,2]);
 assert.deepEqual(comparisonPlayers([],'66','115'),[undefined,undefined]);
});
test('partner matches and self comparisons cannot count as head-to-head meetings',()=>{
 assert.equal(directMeetings([match],66,65).matches.length,0);
 assert.equal(directMeetings([match],66,66).matches.length,0);
 assert.equal(directMeetings([match],66,999).matches.length,0);
});
test('opposing meetings deduplicate and count wins from either team correctly',()=>{
 const reverse={...match,id:2,playedAt:'2026-09-01',winner:'team_2'};
 const result=directMeetings([reverse,match,match],66,115);
 assert.deepEqual(result.matches.map(m=>m.id),[1,2]);
 assert.equal(result.firstWins,1);assert.equal(result.secondWins,1);
 assert.equal(directMeetings([match],115,66).secondWins,1);
});
test('walkovers, byes and unfinished matches do not count as played meetings',()=>{
 const statuses=['walkover','bye','scheduled','live','ended'];
 assert.equal(directMeetings(statuses.map((status,id)=>({...match,status,id})),66,115).matches.length,0);
 assert.equal(directMeetings([{...match,status:'retired'}],66,115).matches.length,1);
});
