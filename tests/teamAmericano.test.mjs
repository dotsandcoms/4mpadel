import test from 'node:test';
import assert from 'node:assert/strict';
import {generateTeamAmericano,teamAmericanoStandings,teamAmericanoPlayers} from '../src/utils/teamAmericano.js';
import {scheduleAmericano} from '../src/utils/americano.js';
for(const n of [2,3,4,5,8,17,32,256])test(`${n} fixed teams meet once with balanced rests`,()=>{
 const s=generateTeamAmericano(Array.from({length:n*2},(_,i)=>({id:String(i),name:`P${i}`})),{courts:1});
 assert.equal(s.fixtures.length,n*(n-1)/2);const pairs=new Set();
 for(const m of s.fixtures){assert.equal(+m.one[1],+m.one[0]+1);assert.equal(+m.two[1],+m.two[0]+1);pairs.add([m.one[0],m.two[0]].sort().join('-'));}
 assert.equal(pairs.size,s.fixtures.length);
 for(let r=1;r<=s.rounds;r++){const ids=s.fixtures.filter(m=>m.round===r).flatMap(m=>[...m.one,...m.two]);assert.equal(new Set(ids).size,ids.length);}
 assert.equal(s.rests.length,n%2?n:0);
});
test('team points are counted once, ties share places',()=>{
 const s=generateTeamAmericano(Array.from({length:6},(_,i)=>({id:String(i),name:`P${i}`})));
 s.fixtures.forEach(m=>m.score=[12,12]);const rows=teamAmericanoStandings(s);assert.equal(rows.length,3);assert.ok(rows.every(r=>r.points===24&&r.played===2&&r.position===1));
});
test('odd teams schedule all fixtures with no empty waves',()=>{
 const s=generateTeamAmericano(Array.from({length:6},(_,i)=>({id:String(i),name:`P${i}`})));
 const result=scheduleAmericano(s,[{is_active:true,courts_count:1,play_date:'2026-10-01',start_time:'08:00',end_time:'18:00'}]);assert.equal(result.fixtures.length,3);assert.ok(result.fixtures.every(m=>m.scheduled_start));
});
test('fixed pair validation rejects duplicate and incomplete entrants',()=>{
 assert.throws(()=>teamAmericanoPlayers([{id:'a',email:'a'}]),/Complete fixed pairs/);
 assert.throws(()=>teamAmericanoPlayers([{id:'a',email:'a',partner_email:'a',partner_name:'A'}]),/one fixed team/);
});
