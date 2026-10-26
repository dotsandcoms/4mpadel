import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const url='https://api.rankedin.com/v1/Ranking/GetRankingsAsync?rankingId=15809&rankingType=3&ageGroup=82&weekFromNow=0&language=en&skip=0&take=1000';
const payload=points=>({Payload:[{RankedinId:'R000258011',ParticipantPoints:{Points:points}}]});
const source=fs.readFileSync(new URL('../src/hooks/useRankedin.js',import.meta.url),'utf8');
const section=source.slice(source.indexOf('const fetchWithCache ='),source.indexOf('\nexport const useRankedin'));

test('legacy cache and stale upstream responses cannot replace the current leaderboard edition',async()=>{
  const cache=new Map([[url,{payload:payload(12620),updated_at:new Date().toISOString()}]]);
  const requests=[];let key;
  const query={select(){return this;},eq(_column,value){key=value;return this;},async maybeSingle(){return {data:cache.get(key)};},async upsert(row){cache.set(row.url,row);return {};}};
  const context={supabase:{from:()=>query},Date,console:{log(){},warn(){},error(){}},fetchWithTimeout:async liveUrl=>{requests.push(liveUrl);return {ok:true,json:async()=>payload(liveUrl.includes('_4m_refresh=')?14320:12620)};}};
  vm.createContext(context);vm.runInContext(section+'\nthis.fetchCached=fetchWithCache;',context);
  const first=await context.fetchCached(url);
  assert.equal(first.Payload[0].ParticipantPoints.Points,14320);
  assert.equal(cache.get(url).payload.Payload[0].ParticipantPoints.Points,12620);
  assert.equal(cache.get(url+'&_4m_cache_version=2').payload.Payload[0].ParticipantPoints.Points,14320);
  await context.fetchCached(url);assert.equal(requests.length,1);
});

test('unrelated event caches keep their existing keys and API URLs',async()=>{
  const eventUrl='https://api.rankedin.com/v1/tournament/GetTournamentInfoAsync?id=123';let requested,stored;
  const query={select(){return this;},eq(){return this;},async maybeSingle(){return {};},async upsert(row){stored=row.url;return {};}};
  const context={supabase:{from:()=>query},Date,console:{log(){},warn(){},error(){}},fetchWithTimeout:async liveUrl=>{requested=liveUrl;return {ok:true,json:async()=>({Name:'Event'})};}};
  vm.createContext(context);vm.runInContext(section+'\nthis.fetchCached=fetchWithCache;',context);
  await context.fetchCached(eventUrl);assert.equal(requested,eventUrl);assert.equal(stored,eventUrl);
});
