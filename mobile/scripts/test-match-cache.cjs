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
 vm.runInNewContext(source, { module, exports: module.exports, require: name => name.includes('supabase') ? {supabase:{from:()=>query}} : {LIVE_AFTER_MS:0}, Date, URL, AbortController, setTimeout, clearTimeout,
 fetch: async (url, options) => { calls.push(url); if(live.fail)throw Error('offline');
 let data = url.includes('playerprofileinfo') ? (live.profile || {Id:123,Statistics:{CareerWinLossDoubles:'0-1',CareerWinLossSingles:'0-0'}}) : url.includes('getlayoutinfo') ? {AnonymousToken:'test-token'} : live.respond ? live.respond(new URL(url)) : url.includes('takehistory=true') ? live.past : live.upcoming;
 if(url.includes('GetPlayerMatches'))assert.equal(options.headers['x-anonymous-token'], 'test-token');
 return {ok:true,json:async()=>data}; } });
 return {api:module.exports,calls};
}
function cache(age, overrides={}) {const stamp=new Date(Date.now()-age).toISOString();return {past_matches:[old], upcoming_matches:[], past_matches_updated_at:stamp,upcoming_matches_updated_at:stamp,...overrides};}
test('fresh complete cache verifies career totals without requesting matches',async()=>{const h=setup(cache(0));const result=await h.api.fetchPlayerMatches('R1');assert.equal(result.past.length,1);assert.equal(result.career.played,1);assert.equal(h.calls.length,1);});
test('expired cache fetches live results with anonymous token',async()=>{const newer={...old,Info:{...old.Info,EventName:'New result'}};const h=setup(cache(360000),{past:{Payload:[newer]},upcoming:{Payload:[]}});const result=await h.api.fetchPlayerMatches('R1');assert.equal(result.past[0].Info.EventName,'New result');assert.equal(h.calls.length,4);});
test('offline and placeholder responses retain repaired saved results',async()=>{for(const live of [{fail:true},{past:{Payload:[{Info:{EventName:'EventName'}}]},upcoming:{Payload:[]}}]){const h=setup(cache(360000),live);assert.equal((await h.api.fetchPlayerMatches('R1')).past[0].Score.Score[0].Score1,2);}});
test('fresh upcoming cache cannot hide expired history',async()=>{const h=setup(cache(0,{past_matches_updated_at:'2020-01-01'}),{past:{Payload:[old]}});await h.api.fetchPlayerMatches('R1');assert(h.calls.some(u=>u.includes('takehistory=true')));assert(!h.calls.some(u=>u.includes('takehistory=false')));});
test('missing or invalid timestamps require live refresh',async()=>{for(const stamp of [null,'bad']){const h=setup(cache(0,{past_matches_updated_at:stamp,updated_at:null}),{past:{Payload:[old]}});await h.api.fetchPlayerMatches('R1');assert(h.calls.some(u=>u.includes('takehistory=true')));}});
test('incomplete live fixture cannot discard published score',async()=>{const h=setup(cache(360000),{past:{Payload:[{...old,Score:{Score:[]}}]},upcoming:{Payload:[]}});assert.equal((await h.api.fetchPlayerMatches('R1')).past[0].Score.Score[0].Score1,2);});

test('all history pages load even when a fresh shared cache contains only 15 matches', async () => {
 const history=Array.from({length:56},(_,index)=>({...old,ChallengeId:index+1,Info:{...old.Info,EventName:`Tournament ${index}`,Date:`${String(index%28+1).padStart(2,'0')}/01/2026`}}));
 const h=setup(cache(0,{past_matches:history.slice(0,15)}),{
  profile:{Id:123,Statistics:{CareerWinLossDoubles:'35-21',CareerWinLossSingles:'0-0'}},
  respond:url=>{assert.equal(url.pathname,'/v1/player/GetPlayerMatchesAsync');const skip=Number(url.searchParams.get('skip'));return {Payload:history.slice(skip,skip+40),HasMore:skip===0};}
 });
 const [first,second]=await Promise.all([h.api.fetchPlayerMatches('R1'),h.api.fetchPlayerMatches('R1')]);
 assert.equal(first.past.length,56);assert.equal(first.career.played,56);assert.equal(first,second);
 assert.equal(first.past.filter(m=>m.Info.Date.includes('/01/2026')).length,56);
 assert.deepEqual(h.calls.filter(url=>url.includes('GetPlayerMatches')).map(url=>Number(new URL(url).searchParams.get('skip'))),[0,40]);
 const count=h.calls.length;await h.api.fetchPlayerMatches('R1');assert.equal(h.calls.length,count);
});

test('following upcoming fixtures does not download each followed player’s career history', async () => {
 const h=setup(cache(360000),{upcoming:{Payload:[{...old,Info:{...old.Info,Date:'01/01/2099'}}],HasMore:false}});
 const result=await h.api.fetchPlayerMatches('R1',{requireUpcoming:true,includeHistory:false});
 assert.equal(result.upcoming.length,1);assert.equal(result.past.length,0);
 assert(!h.calls.some(url=>url.includes('takehistory=true')||url.includes('ParticipatedEvents')||url.includes('tournament/')));
});

const fixture=(id,player=123,onFirst=true)=>({Id:id,Date:'0001-01-01T00:00:00',Challenger:{Name:'A',Player2Name:'B',Player1Id:onFirst?player:456},Challenged:{Name:'C',Player2Name:'D',Player2Id:onFirst?789:player},MatchResult:{IsPlayed:true,IsFirstParticipantWinner:true,Score:{FirstParticipantScore:2,SecondParticipantScore:1,DetailedScoring:[]}}});
test('placeholder history falls back to every participated event and individual team results', async () => {
 const events=Array.from({length:7},(_,index)=>({Id:index+1,Name:`Event ${index+1}`,StartDate:'2026-01-10T09:00:00'}));
 const h=setup(cache(0,{past_matches:[]}),{
  profile:{Id:123,Statistics:{CareerWinLossDoubles:'7-1'}},
  respond:url=>{
   if(url.pathname.includes('GetPlayerMatches'))return {Payload:[{Info:{EventName:'EventName'}}],HasMore:true};
   if(url.pathname.includes('ParticipatedEvents'))return {Payload:events,TotalCount:7};
   if(url.pathname.includes('GetTournamentTeamsMatches'))return [{Matches:{Matches:[fixture(70),fixture(71,123,false),fixture(72,999)]}}];
   const id=Number(url.searchParams.get('Id'));
   return {Matches:id===7?[{Id:700,Challenger:{Player1Url:'/en/team/T1/north'},Challenged:{Player1Url:'/en/team/T2/south'}}]:[fixture(id),{...fixture(100+id),MatchResult:{IsPlayed:false}},fixture(200+id,999)]};
  }
 });
 const result=await h.api.fetchPlayerMatches('R1');
 assert.equal(result.past.length,8);assert.equal(result.past.filter(h.api.isMatchWinner).length,7);
 assert(result.past.some(match=>match.Info.EventName==='Event 1'));
 assert(result.past.every(match=>match.Info.Date==='10/01/2026 09:00'));
 assert.equal(result.past[0].Score.IsSummary,true);
 assert.equal(result.past[0].Score.Score[0].Score1,2);
 assert.equal(h.calls.filter(url=>url.includes('GetMatchesSection')).length,7);
});

test('a repeated paginated page cannot loop indefinitely and saved history survives', async () => {
 const h=setup(cache(360000),{profile:{Id:123},respond:url=>url.pathname.includes('GetPlayerMatches')?{Payload:[old],HasMore:true}:undefined});
 assert.equal((await h.api.fetchPlayerMatches('R1')).past.length,1);
 assert.equal(h.calls.filter(url=>url.includes('takehistory=true')).length,2);
});

test('individual score determines the winner when a team result flag disagrees', async () => {
 const match=fixture(1);match.MatchResult.Score={FirstParticipantScore:0,SecondParticipantScore:2,IsFirstParticipantWinner:false,DetailedScoring:[{FirstParticipantScore:5,SecondParticipantScore:7},{FirstParticipantScore:3,SecondParticipantScore:6}]};
 const h=setup(cache(0,{past_matches:[]}),{respond:url=>url.pathname.includes('GetPlayerMatches')?{Payload:[{Info:{EventName:'EventName'}}]}:url.pathname.includes('ParticipatedEvents')?{Payload:[{Id:1,Name:'Team event',StartDate:'2026-05-15'}],TotalCount:1}:{Matches:[match]}});
 const {past}=await h.api.fetchPlayerMatches('R1');
 assert.equal(past.length,1);assert.equal(h.api.isMatchWinner(past[0]),false);assert.equal(past[0].Info.Challenger.IsWinner,false);assert.equal(past[0].Info.Challenged.IsWinner,true);assert.equal(past[0].Score.IsSummary,false);
});

test('participated event pagination follows TotalCount even when RankedIn returns a short page', async () => {
 const h=setup(cache(0,{past_matches:[]}),{profile:{Id:123,Statistics:{CareerWinLossDoubles:'2-0'}},respond:url=>{
  if(url.pathname.includes('GetPlayerMatches'))return {Payload:[{Info:{EventName:'EventName'}}]};
  if(url.pathname.includes('ParticipatedEvents')){const id=Number(url.searchParams.get('skip'))+1;return {Payload:[{Id:id,Name:`Event ${id}`,StartDate:'2026-01-10'}],TotalCount:2};}
  return {Matches:[fixture(Number(url.searchParams.get('Id')))]};
 }});
 assert.equal((await h.api.fetchPlayerMatches('R1')).past.length,2);
 assert.deepEqual(h.calls.filter(url=>url.includes('ParticipatedEvents')).map(url=>new URL(url).searchParams.get('skip')),['0','1']);
});

test('profile career totals use published records and exclude upcoming fixtures', async () => {
 const code=ts.transpileModule(fs.readFileSync('src/lib/profile.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}};
 const query={select(){return this},ilike(){return this},eq(){return this},order(){return this},limit:async()=>({data:[]}),maybeSingle:async()=>({data:{id:1,rankedin_id:'R1'}})};
 vm.runInNewContext(code,{module,exports:module.exports,Date,require:name=>name.includes('matches')?{fetchPlayerMatches:async()=>({upcoming:[old],past:[old],career:{played:56,wins:35,losses:21}}),isMatchWinner:()=>false}:name.includes('supabase')?{supabase:{from:()=>query}}:{}});
 const {stats}=await module.exports.fetchProfileBundle('player@example.com');
 assert.equal(stats.matchCount,56);assert.equal(stats.played,56);assert.equal(stats.wins,35);assert.equal(stats.losses,21);assert.equal(stats.winRatio,62.5);
});
