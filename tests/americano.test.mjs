import test from 'node:test';
import assert from 'node:assert/strict';
import { generateAmericano, americanoStandings, americanoPlayers, validateAmericanoScore } from '../src/utils/americano.js';
import { generateGroupStageDraft } from '../src/utils/nativeDrawGenerator.js';
const players = n => Array.from({length:n}, (_,i) => ({id:String(i), name:`Player ${i}`}));
for (const n of [4,8,12,16,20,32,64]) test(`${n} players: everyone plays once per round and partners everyone once`, () => {
    const state=generateAmericano(players(n));
    assert.equal(state.fixtures.length,n*(n-1)/4);
    const partnerships = new Set();
    for(let r=1;r<n;r++) {
        const matches=state.fixtures.filter(m=>m.round===r);
        const entrants=matches.flatMap(m=>[...m.one,...m.two]);
        assert.equal(entrants.length,n); assert.equal(new Set(entrants).size,n);
        for(const m of matches) for(const side of [m.one,m.two]) {const key=[...side].sort().join(':'); assert.ok(!partnerships.has(key));partnerships.add(key);}
    }
    assert.equal(partnerships.size,n*(n-1)/2);
});
test('16 ladies: shortened rotation and limited court waves',()=>{
    const state=generateAmericano(players(16),{rounds:8,courts:2});
    assert.equal(state.fixtures.length,32);
    assert.deepEqual(state.fixtures.slice(0,4).map(m=>[m.court,m.wave]),[[1,1],[2,1],[1,2],[2,2]]);
});
test('points follow both individuals; corrections recalculate and tied matches count',()=>{
    const state=generateAmericano(players(4),{rounds:1});
    const match=state.fixtures[0];match.score=[14,10];
    let rows=americanoStandings(state);
    assert.equal(rows.find(p=>p.id===match.one[0]).points,14);
    assert.equal(rows.find(p=>p.id===match.one[1]).position,1);
    match.score=[12,12];rows=americanoStandings(state);
    assert.ok(rows.every(p=>p.points===12&&p.position===1&&p.won===0&&p.played===1));
    match.score=null;assert.ok(americanoStandings(state).every(p=>p.played===0));
});
test('validation rejects incomplete fields, repeat rotations and invalid scores',()=>{
    for(const n of [0,3,5,15,65]) assert.throws(()=>generateAmericano(players(n)));
    for(const options of [{rounds:16},{rounds:0},{rounds:1.5},{points:0},{points:-1},{points:2.5},{points:2147483648},{points:Infinity},{courts:0},{courts:5}]) assert.throws(()=>generateAmericano(players(16),options));
    assert.equal(validateAmericanoScore([0,24],24),true);
    for(const score of [[24,10],[-1,25],[12.5,11.5],[null,24],[12],null]) assert.equal(validateAmericanoScore(score,24),false);
});
test('individual entrants dedupe reciprocal paid registrations without importing partner names',()=>{
    const rows=[{id:'1',email:'A@test.com',full_name:'A',payment_status:'paid',partner_name:'B'}, {id:'2',email:'a@test.com',full_name:'A',payment_status:'paid'},{id:'3',email:'b@test.com',full_name:'B',payment_status:'pending'}, {id:'4',email:'c@test.com',status:'withdrawn',payment_status:'paid'}];
    assert.deepEqual(americanoPlayers(rows),[{id:'1',name:'A'}]);
});
for(const [n,groups,matches] of [[32,8,48],[16,4,24],[32,1,496],[16,1,120]]) test(`${n*2} men, ${groups} groups: correct field and fixture coverage`,()=>{
    const entries=players(n).map(p=>({source_registration_id:p.id,team_name:p.name}));
    const draw=generateGroupStageDraft(entries,{groupCount:groups,format:'group_only'});
    assert.equal(draw.matches.length,matches);assert.equal(draw.entries.length,n);
    for(const group of draw.groups) {const meetings=new Set(group.fixtures.map(m=>[m.entry_one.source_registration_id,m.entry_two.source_registration_id].sort().join(':')));assert.equal(meetings.size,group.entries.length*(group.entries.length-1)/2);}
});

test('timed Americano respects shared courts, daily bounds and round rest',async()=>{
    const {scheduleAmericano}=await import('../src/utils/americano.js');
    const state=generateAmericano(players(16),{rounds:2,courts:2});
    const days=[{play_date:'2026-09-20',start_time:'08:00',end_time:'12:00',courts_count:2,is_active:true}];
    const start=new Date('2026-09-20T08:00').getTime();
    const scheduled=scheduleAmericano(state,days,[{court_name:'Court 1',scheduled_start:new Date(start).toISOString(),scheduled_end:new Date(start+30*60000).toISOString()}]);
    assert.equal(Date.parse(scheduled.fixtures[0].scheduled_start),start+30*60000);
    assert.equal(Date.parse(scheduled.fixtures[4].scheduled_start),start+65*60000);
    assert.throws(()=>scheduleAmericano(state,[{...days[0],end_time:'08:15'}]));
    assert.throws(()=>scheduleAmericano(state,days,[],{minutes:0}));
});

for (const points of [1, 25, 40, 51, 100, 2147483647]) test(`custom ${points}-point rotation and individual scoring`, () => {
    const state = generateAmericano(players(4), {rounds:1, points});
    const score = [Math.ceil(points/2), Math.floor(points/2)];
    state.fixtures[0].score = score;
    assert.equal(state.points, points);
    assert.equal(validateAmericanoScore(score, points), true);
    assert.equal(validateAmericanoScore([points,1], points), false);
    const rows = americanoStandings(state);
    assert.equal(rows.find(p => p.id === state.fixtures[0].one[0]).points, score[0]);
});

test('rescheduling preserves played waves and results while moving remaining matches', async () => {
    const {scheduleAmericano} = await import('../src/utils/americano.js');
    const days = [{play_date:'2026-09-20',start_time:'08:00',end_time:'12:00',courts_count:2,is_active:true}];
    const original = scheduleAmericano(generateAmericano(players(8), {rounds:3,courts:2}), days);
    original.fixtures[0].score = [14,10];
    const next = scheduleAmericano(original, days, [], {minutes:30,restMinutes:10});
    assert.deepEqual(next.fixtures.slice(0,2), original.fixtures.slice(0,2));
    assert.equal(Date.parse(next.fixtures[2].scheduled_start), Date.parse(original.fixtures[0].scheduled_end) + 10*60000);
    assert.equal(Date.parse(next.fixtures[2].scheduled_end)-Date.parse(next.fixtures[2].scheduled_start),30*60000);
    assert.notEqual(next.fixtures[2].scheduled_start,original.fixtures[2].scheduled_start);
    const untimed = generateAmericano(players(8), {rounds:3,courts:2});
    untimed.fixtures[0].score = [14,10];
    assert.throws(() => scheduleAmericano(untimed, days), /Played rounds need/);
});
