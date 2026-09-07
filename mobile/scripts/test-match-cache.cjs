const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
const source = ts.transpileModule(fs.readFileSync('src/lib/matches.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const old = { Info: { EventName: 'Pretoria Major', Date: '14/08/2026', Challenger: { Name: 'A' }, Challenged: { Name: 'B' } }, Score: { Score: [{ Score1: 2, Score2: 1 }], IsSummary: true } };
function setup(row, live = {}) {
 const module = { exports: {} }; const calls = [];
 const query = { select(){return this}, eq(){return this}, async maybeSingle(){return {data:row}} };
 vm.runInNewContext(source, { module, exports: module.exports, require: name => name.includes('supabase') ? {supabase:{from:()=>query}} : {LIVE_AFTER_MS:0}, Date, AbortController, setTimeout, clearTimeout,
 fetch: async (url, options) => { calls.push(url); if(live.fail)throw Error('offline');
 let data = url.includes('playerprofileinfo') ? {Id:123} : url.includes('getlayoutinfo') ? {AnonymousToken:'test-token'} : url.includes('takehistory=true') ? live.past : live.upcoming;
 if(url.includes('GetPlayerMatches'))assert.equal(options.headers['x-anonymous-token'], 'test-token');
 return {ok:true,json:async()=>data}; } });
 return {api:module.exports,calls};
}
function cache(age, overrides={}) {const stamp=new Date(Date.now()-age).toISOString();return {past_matches:[old], upcoming_matches:[], past_matches_updated_at:stamp,upcoming_matches_updated_at:stamp,...overrides};}
test('fresh cache avoids RankedIn requests',async()=>{const h=setup(cache(0));assert.equal((await h.api.fetchPlayerMatches('R1')).past.length,1);assert.equal(h.calls.length,0);});
test('expired cache fetches live results with anonymous token',async()=>{const newer={...old,Info:{...old.Info,EventName:'New result'}};const h=setup(cache(360000),{past:{Payload:[newer]},upcoming:{Payload:[]}});const result=await h.api.fetchPlayerMatches('R1');assert.equal(result.past[0].Info.EventName,'New result');assert.equal(h.calls.length,4);});
test('offline and placeholder responses retain repaired saved results',async()=>{for(const live of [{fail:true},{past:{Payload:[{Info:{EventName:'EventName'}}]},upcoming:{Payload:[]}}]){const h=setup(cache(360000),live);assert.equal((await h.api.fetchPlayerMatches('R1')).past[0].Score.Score[0].Score1,2);}});
test('fresh upcoming cache cannot hide expired history',async()=>{const h=setup(cache(0,{past_matches_updated_at:'2020-01-01'}),{past:{Payload:[old]}});await h.api.fetchPlayerMatches('R1');assert(h.calls.some(u=>u.includes('takehistory=true')));assert(!h.calls.some(u=>u.includes('takehistory=false')));});
test('missing or invalid timestamps require live refresh',async()=>{for(const stamp of [null,'bad']){const h=setup(cache(0,{past_matches_updated_at:stamp,updated_at:null}),{past:{Payload:[old]}});await h.api.fetchPlayerMatches('R1');assert(h.calls.some(u=>u.includes('takehistory=true')));}});
test('incomplete live fixture cannot discard published score',async()=>{const h=setup(cache(360000),{past:{Payload:[{...old,Score:{Score:[]}}]},upcoming:{Payload:[]}});assert.equal((await h.api.fetchPlayerMatches('R1')).past[0].Score.Score[0].Score1,2);});
