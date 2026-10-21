import test from 'node:test';
import assert from 'node:assert/strict';
import { exploreRequest, normalizePlayer, normalizePlayerStats, normalizeMatchStats, normalizeExploreMatch, fetchExplore } from '../server/pro-explore.mjs';
import { createExploreHandler } from '../api/pro-explore.js';
const player = { id: 2781, name: 'Outside top 50', category: 'men', ranking: 1565, points: 8, elo: 1348 };
const match = { id: 1, category: 'men', round: 8, status: 'finished', winner: 'team_1', players: { team_1: [{id:66,name:'A'}],team_2:[{id:115,name:'B'}] }, score:[{team_1:'6',team_2:'4'}],duration:'01:58',started_time:'2026-09-13T16:42:26+02:00',connections:{tournament:'/api/tournaments/743'} };
const event = { id:743,name:'Paris Major',start_date:'2026-09-07',end_date:'2026-09-13',level:'major' };
const list = data => ({data,meta:{current_page:1,last_page:4,total:65}});
function res() { return { headers:{},setHeader(key,value){this.headers[key]=value;},status(code){this.code=code;return this;},json(body){this.body=body;return this;} }; }
test('directory search paginates past top 50 and encodes filters', () => {
  const req = exploreRequest({kind:'search',category:'men',q:'Leal & partners',page:'9',country:'ES',side:'backhand'});
  const url = new URL(req.url);
  assert.equal(url.searchParams.get('page'),'9');assert.equal(url.searchParams.get('name'),'Leal & partners');assert.equal(url.searchParams.get('per_page'),'20');
  assert.equal(normalizePlayer(player).rank,1565);
  assert.throws(()=>exploreRequest({kind:'search',category:'invalid'}));assert.throws(()=>exploreRequest({kind:'player',id:'../../secret'}));assert.throws(()=>exploreRequest({kind:'search',category:'men',page:-1}));
});
test('safe normalizers preserve zero and coverage without restricted values or credentials', () => {
  const profile=normalizePlayer({...player,photo_url:'javascript:alert(1)',height:'hidden_free_plan',connections:{token:'private'}});
  assert.equal(profile.photoUrl,null);assert.equal(profile.height,null);assert.equal(profile.connections,undefined);
  const stats=normalizePlayerStats({id:2781,coverage:'partial',performance_since:'2023-02-22',titles:0,matches_played:3,matches_won:0,sets_won:'hidden_free_plan'},2781);
  assert.equal(stats.titles,0);assert.equal(stats.coverage,'partial');assert.equal(stats.sets_won,null);
  assert.throws(()=>normalizePlayerStats({id:1},2781));
  const record=normalizeExploreMatch({...match,duration:'hidden_free_plan',started_time:'2026-09-13T16:00:00'});
  assert.equal(record.duration,null);assert.equal(record.startedAt,null);assert.equal(record.watchability,null);
});
test('team statistics keep percentages and zeroes per set, strip unavailable fields', () => {
  const stats=normalizeMatchStats({id:1,match:{aces:{team_1:'0',team_2:'0'},total_points_won:{team_1:'52%',team_2:'48%'},private:{team_1:'secret'}},set_1:{aces:{team_1:'hidden_free_plan',team_2:'1'}}},1);
  assert.deepEqual(stats.match.find(row=>row.key==='aces').values,['0','0']);assert.deepEqual(stats.set_1[0].values,[null,'1']);assert.equal(stats.set_3.length,0);assert.equal(stats.match.length,2);
});
test('match history enriches tournament names and preserves pagination',async()=>{
  const calls=[];
  const result=await fetchExplore(exploreRequest({kind:'player-matches',id:66}),{token:'test',read:async url=>{calls.push(url);return url.includes('/tournaments/')?event:list([match,{...match,id:2}]);}});
  assert.equal(result.matches[0].tournamentName,'Paris Major');assert.equal(result.pages,4);assert.equal(calls.length,2);
});
test('comparison requests search opposing players without changing data',()=>{
  const req=exploreRequest({kind:'comparison-history',id:66,against:115,page:2});assert.deepEqual(req.body,{team_1:[66],team_2:[115]});assert.match(req.url,/headtohead/);assert.throws(()=>exploreRequest({kind:'comparison-history',id:66,against:66}));
});
test('handler rejects bad input without provider calls and sanitizes failures',async()=>{
  let calls=0;const handler=createExploreHandler({token:()=> 'private-token',fetchImpl:async()=>{calls++;throw new Error('private-token');}});
  const invalid=res();await handler({method:'GET',query:{kind:'player',id:'bad'}},invalid);assert.equal(invalid.code,400);assert.equal(calls,0);
  const failed=res();await handler({method:'GET',query:{kind:'player',id:2781}},failed);assert.equal(failed.code,503);assert.doesNotMatch(JSON.stringify(failed.body),/private-token/);assert.equal(failed.headers['Cache-Control'],'no-store');
});
test('handler deduplicates and caches repeated requests',async()=>{
  let calls=0;const handler=createExploreHandler({token:()=> 'test',fetchImpl:async()=>{calls++;return Response.json(player);}});
  const a=res(),b=res();await Promise.all([handler({method:'GET',query:{kind:'player',id:2781}},a),handler({method:'GET',query:{kind:'player',id:2781}},b)]);assert.equal(calls,1);assert.equal(a.body.player.id,2781);assert.equal(b.code,200);
});

test('current tour includes running events, opening rounds and every page', async()=> {
  const { currentTour } = await import('../server/pro-explore.mjs');
  const active = {...event,id:745,name:'Rotterdam P2',status:'live',start_date:'2026-09-28',end_date:'2026-10-04'};
  const calls=[];
  const result=await currentTour({data:[active,{...active,id:743,status:'finished'}],meta:{current_page:1,last_page:1,total:2}},async url=>{calls.push(url);const page=Number(new URL(url).searchParams.get('page'));return {data:[{...match,id:page,round:page===1?16:8,status:page===1?'finished':'scheduled'}],meta:{current_page:page,last_page:2,total:2}};},()=>new Date('2026-10-01T08:00:00Z'));
  assert.equal(result.tournaments.length,1);assert.equal(result.matches.length,2);assert.equal(result.matches[0].round,16);assert.equal(result.matches[1].status,'scheduled');assert.equal(calls.length,2);
});
test('invalid current-tour pagination fails rather than serving a partial tournament',async()=>{
  const {currentTour}=await import('../server/pro-explore.mjs');
  const listing={data:[{...event,status:'live'}],meta:{current_page:1,last_page:1,total:1}};
  await assert.rejects(currentTour(listing,async()=>({data:[match],meta:{current_page:1,last_page:9,total:400}})),/incomplete/);
  assert.doesNotThrow(()=>exploreRequest({kind:'current-tour'}));
});


test('cached and concurrent website responses retain saved-data freshness',async()=>{
  let calls=0;
  const handler=createExploreHandler({token:()=> 'test',fetchImpl:async()=>{calls++;return Response.json(player,{headers:{'x-4m-cache':'stale','x-4m-fetched-at':'2026-10-08T06:00:00Z'}});}});
  const a=res(),b=res(),c=res();
  await Promise.all([handler({method:'GET',query:{kind:'player',id:2781}},a),handler({method:'GET',query:{kind:'player',id:2781}},b)]);
  await handler({method:'GET',query:{kind:'player',id:2781}},c);
  assert.equal(calls,1);
  for(const response of [a,b,c]) {assert.equal(response.body._freshness.stale,true);assert.equal(response.body._freshness.updatedAt,'2026-10-08T06:00:00Z');assert.match(response.headers['Cache-Control'],/s-maxage=15/);}
});
