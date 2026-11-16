import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const url='https://api.rankedin.com/v1/Ranking/GetRankingsAsync?rankingId=15809&rankingType=3&ageGroup=82&weekFromNow=0&language=en&skip=0&take=1000';
const key=url+'&_4m_cache_version=2';
const payload=points=>({Payload:[{RankedinId:'R000258011',ParticipantPoints:{Points:points}}]});
const source=fs.readFileSync(new URL('../src/hooks/useRankedin.js',import.meta.url),'utf8');
const section=source.slice(source.indexOf('const fetchWithCache ='),source.indexOf('\nexport const useRankedin'));
function fixture(entries=[],provider=async liveUrl=>payload(liveUrl.includes('_4m_refresh=')?14320:12620)){
  let time=Date.now();class Clock extends Date{static now(){return time;}}
  const cache=new Map(entries),requests=[],reads=[];let selected;
  const query={select(){return this;},eq(_column,value){selected=value;reads.push(value);return this;},
    async maybeSingle(){return {data:cache.get(selected)};},
    upsert(){throw new Error('Browser must not write shared ranking caches');}};
  const context={supabase:{from:()=>query},Date:Clock,console:{log(){},warn(){},error(){}},
    fetchWithTimeout:async liveUrl=>{requests.push(liveUrl);return {ok:true,json:()=>provider(liveUrl)};}};
  vm.createContext(context);vm.runInContext(section+'\nthis.fetchCached=fetchWithCache;',context);
  return{cache,requests,reads,fetch:context.fetchCached,advance:ms=>{time+=ms;}};
}

test('legacy leaderboard entries cannot mask a fresh edition; browser results do not overwrite shared data',async()=>{
  const f=fixture([[url,{payload:payload(12620),updated_at:new Date().toISOString()}]]);
  const first=await f.fetch(url);
  assert.equal(first.Payload[0].ParticipantPoints.Points,14320);
  assert.equal(f.cache.get(url).payload.Payload[0].ParticipantPoints.Points,12620);
  assert.equal(f.cache.has(key),false);
  assert.equal(f.reads[0],key);
  assert.match(f.requests[0],/&_4m_refresh=\d+$/);
  await f.fetch(url);assert.equal(f.requests.length,1);
});

test('a fresh trusted versioned cache avoids a provider request',async()=>{
  const f=fixture([[key,{payload:payload(14320),updated_at:new Date().toISOString()}]]);
  assert.equal((await f.fetch(url)).Payload[0].ParticipantPoints.Points,14320);
  assert.equal(f.requests.length,0);
});

test('leaderboards refresh after five minutes and a manual refresh bypasses memory',async()=>{
  let points=14320;
  const f=fixture([],async()=>payload(points));
  await f.fetch(url);points=14400;
  f.advance(5*60*1000+1);
  assert.equal((await f.fetch(url)).Payload[0].ParticipantPoints.Points,14400);
  points=14500;
  assert.equal((await f.fetch(url,{},6*60*60*1000,true)).Payload[0].ParticipantPoints.Points,14500);
  assert.equal(f.requests.length,3);
});

test('an empty rollover response preserves the last successful versioned leaderboard',async()=>{
  let empty=false;const f=fixture([],async()=>empty?{Payload:[]}:payload(14320));
  await f.fetch(url);empty=true;
  assert.equal((await f.fetch(url,{},300000,true)).Payload[0].ParticipantPoints.Points,14320);
  const legacyOnly=fixture([[url,{payload:payload(12620),updated_at:new Date().toISOString()}]],async()=>({Payload:[]}));
  await assert.rejects(legacyOnly.fetch(url),/temporarily unavailable/);
});

test('unrelated event caches retain their existing read keys and provider URLs',async()=>{
  const eventUrl='https://api.rankedin.com/v1/tournament/GetTournamentInfoAsync?id=123';
  const f=fixture([],async()=>({Name:'Event'}));
  assert.equal((await f.fetch(eventUrl)).Name,'Event');
  assert.equal(f.requests[0],eventUrl);assert.equal(f.reads[0],eventUrl);
});
