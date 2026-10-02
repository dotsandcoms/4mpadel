const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
function load(fetchPlayerMatches) {
 const module={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/followed-local-matches.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,require:()=>({fetchPlayerMatches,parseMatchDate:s=>new Date(s)})});
 return module.exports;
}
const player=id=>({id:String(id),key:`4m:${id}`,source:'4m',rankedinId:`rk${id}`});
const match=(date='2030-10-02T10:00:00Z',reverse=false)=>({Info:{EventName:'Open',Date:date,Court:'1',Challenger:{Name:reverse?'C':'A'},Challenger1:{Name:reverse?'D':'B'},Challenged:{Name:reverse?'A':'C'},Challenged1:{Name:reverse?'B':'D'}}});
test('shared fixture appears once with both followed players, sorted by start',()=>{
 const result=load().mergeFollowedFixtures([{player:player(1),matches:[match(),match('2030-10-01T10:00:00Z')]},{player:player(2),matches:[match(undefined,true)]}]);
 assert.equal(result.length,2);assert.equal(result[1].players.length,2);assert.equal(result[0].match.Info.Date,'2030-10-01T10:00:00Z');
});
test('loads stable RankedIn IDs, bounds concurrency, retains successes and reports unavailable links',async()=>{
 let active=0,max=0;const calls=[];
 const api=load(async(id,options)=>{calls.push(id);assert.equal(options.requireUpcoming,true);active++;max=Math.max(max,active);await new Promise(resolve=>setTimeout(resolve,2));active--;if(id==='rk2')throw Error('offline');return {upcoming:[match()]};});
 const result=await api.fetchFollowedLocalFixtures([...Array.from({length:5},(_,i)=>player(i+1)),{...player(6),rankedinId:undefined}]);
 assert.equal(calls.length,5);assert.ok(max<=3);assert.equal(result.failed,1);assert.equal(result.unlinked,1);assert.equal(result.fixtures.length,1);assert.equal(result.fixtures[0].players.length,4);
});
