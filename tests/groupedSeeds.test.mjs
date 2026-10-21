import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKnockoutDraft} from '../src/utils/nativeDrawGenerator.js';
const entries=Array.from({length:16},(_,i)=>({id:`t${i+1}`,team_name:`Team ${i+1}`,seed_number:i+1}));
test('seed groups shuffle internally, preserve ranking labels, and leave remaining teams unseeded',()=>{
 const d=generateKnockoutDraft(entries,{seedingMethod:'native_ranking',seededCount:8,random:()=>0});
 assert.deepEqual(d.entries.slice(0,2).map(e=>e.id),['t1','t2']);
 assert.deepEqual(new Set(d.entries.slice(2,4).map(e=>e.id)),new Set(['t3','t4']));
 assert.notEqual(d.entries[2].id,'t3');
 assert.deepEqual(new Set(d.entries.slice(4,8).map(e=>e.id)),new Set(['t5','t6','t7','t8']));
 assert.ok(d.entries.slice(8).every(e=>e.seed_number===null));
 assert.ok(d.entries.slice(0,8).every(e=>e.seed_number===Number(e.id.slice(1))));
});
test('explicit count supports eight seeded teams in a twelve-team draw',()=>{
 const d=generateKnockoutDraft(entries.slice(0,12),{seededCount:8});assert.equal(d.entries.filter(e=>e.seed_number!==null).length,8);assert.equal(d.draw_size,16);
});
