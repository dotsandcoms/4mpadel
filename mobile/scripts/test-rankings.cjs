const test=require('node:test');const assert=require('node:assert/strict');const ts=require('typescript');const fs=require('node:fs');const vm=require('node:vm');
function load(cache,live,calendar={data:[]}){const module={exports:{}};const code=ts.transpileModule(fs.readFileSync('src/lib/rankings.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const query={select(){return this},eq(){return this},async maybeSingle(){return {data:cache}}};vm.runInNewContext(code,{module,exports:module.exports,require:()=>({supabase:{from:table=>table==='calendar'?{select:async()=>calendar}:query}}),fetch:live,AbortController,setTimeout,clearTimeout,Date});return module.exports;}
const fixture={Payload:[{Name:'One Player',Standing:19,StandingDiff:-2,Participant:{Id:1234},ParticipantPoints:{Points:2692}}]};
test('empty fresh cache does not hide live standings',async()=>{let calls=0;const api=load({payload:{Payload:[]},updated_at:new Date().toISOString()},async()=>{calls++;return{ok:true,json:async()=>fixture}});const rows=await api.fetchRankings(15809,api.categoriesFor(15809)[0]);assert.equal(calls,1);assert.equal(rows[0].rank,19);assert.equal(rows[0].change,-2);assert.equal(rows[0].participantId,'1234');});
test('malformed service response is an error, not an empty league',async()=>{const api=load(null,async()=>({ok:true,json:async()=>({error:'Unavailable'})}));await assert.rejects(api.fetchRankings(15809,api.categoriesFor(15809)[0]),/temporarily unavailable/);});
test('verified Grand Tour age groups differ from national main categories',()=>{const api=load(null,null);assert.equal(api.categoriesFor(16482)[0].age,2);assert.equal(api.categoriesFor(16482)[4].age,6);assert.equal(api.categoriesFor(15809)[1].age,83);assert.equal(api.categoriesFor(15809)[1].type,4);});

const pointPayload = rows => ({ ParticipantWithPoints: { EventPoints: { Payload: rows } } });
const event = (name, points, id, standing=1, type=4) => ({ EventName: name, EventUrl: `/en/tournament/${id}/event`, EventPoint: { Date: '18/10/2026', EventName: `${name} | Class: Men's Open`, Standing: standing, EventType: type, Points: points } });
const response = payload => ({ ok:true, json:async()=>payload });

test('a freshly timestamped six-hour cache cannot hide the current counted edition', async()=>{
  const stale=pointPayload([event('Old edition',12620,1)]);
  const api=load({payload:stale,updated_at:new Date().toISOString()},async()=>response(pointPayload([event('Nationals',2600,75314),event('Remaining counted events',11720,2)])));
  const rows=await api.fetchPoints('201351',82,false);
  assert.equal(rows.reduce((sum,row)=>sum+row.points,0),14320);
  assert.equal(rows[0].name,'Nationals');assert.equal(rows[0].eventId,'75314');
});

test('points share concurrent lookups but every later refresh fetches the provider again', async()=>{
  let calls=0,release;
  const pending=new Promise(resolve=>{release=resolve;});
  const api=load(null,async()=>{calls++;await pending;return response(pointPayload([event('Current',calls,1)]));});
  const a=api.fetchPoints('201351',82,true),b=api.fetchPoints('201351',82,true);
  release();await Promise.all([a,b]);assert.equal(calls,1);
  await api.fetchPoints('201351',82,true);assert.equal(calls,2);
});

test('full history paginates instead of silently losing older wins', async()=>{
  const urls=[];
  const api=load(null,async url=>{urls.push(url);const skip=Number(new URL(url).searchParams.get('skip'));return response(pointPayload(skip===0?Array.from({length:100},(_,i)=>event(`Event ${i}`,10,i+1)):[event('Older winner',100,101)]));});
  const rows=await api.fetchPoints('201351',82,true);
  assert.equal(rows.length,101);assert.equal(rows[100].name,'Older winner');assert.match(urls[1],/skip=100/);
});

test('provider failures and malformed points are reported instead of returning stale cache', async()=>{
  for(const live of [async()=>({ok:false,status:503}),async()=>response({}),async()=>{throw new Error('offline');}]) {
    const api=load({payload:pointPayload([event('Stale',100,1)]),updated_at:new Date().toISOString()},live);
    await assert.rejects(api.fetchPoints('201351',82,false));
  }
});

test('repair rows missing participant IDs recover only the exact player in the same category', async()=>{
  let url;
  const api=load(null,async value=>{url=value;return response({Payload:[
    {Name:'Same Name',RankedinId:'R000000001',Participant:{Id:9}},
    {Name:'Same Name',RankedinId:'R000258011',Participant:{Id:201351}},
  ]});});
  const identity=await api.resolveResultIdentity({ranking_id:15809,ranking_type:3,age_group_id:82},'R000258011');
  assert.equal(identity.participant,'201351');assert.equal(identity.age,82);assert.match(url,/rankingId=15809&rankingType=3&ageGroup=82/);
  await assert.rejects(api.resolveResultIdentity({ranking_id:15809,age_group_id:82},'Rmissing'),/not linked/);
});

test('trophies use full live history, deduplicate cross-organisation wins and prefer a published calendar tier', async()=>{
  const urls=[];
  const calendar={data:[{rankedin_id:74466,event_name:'Cape Town Open',sapa_status:'None'},{rankedin_id:74466,event_name:'Cape Town Open',sapa_status:'Super Gold'}]};
  const api=load(null,async url=>{urls.push(url);return response(pointPayload([
    event('Nationals',2600,75314),event('Cape Town Open',1500,74466),event('Historic Gold',500,3),event('Runner-up',900,4,2),event('League',1,5,1,3),
  ]));},calendar);
  const groups=await api.fetchTournamentWins({rankedinId:'R000258011',profile:{rankings:[
    {org:'SAPA ranking',ranking_participant_id:201351,age_group_id:82,details:[{name:'Stale winner',place:'1'}]},
    {org:'Broll Pro Tour',ranking_participant_id:201436,age_group_id:82},
  ]}});
  assert.equal(urls.length,2);assert.ok(urls.every(url=>url.includes('showAll=true')));
  assert.equal(groups.reduce((sum,g)=>sum+g.count,0),3);
  assert.equal(groups.find(g=>g.tier==='Super Gold').events[0].name,'Cape Town Open');
  assert.equal(groups.find(g=>g.tier==='Gold').count,1);
  assert.equal(groups.flatMap(g=>g.events).find(w=>w.name==='Nationals').results.length,1);
  assert.ok(!groups.flatMap(g=>g.events).some(w=>w.name==='Stale winner'));
});

test('calendar failure cannot turn known trophies into misleading Other trophies', async()=>{
  const api=load(null,async()=>response(pointPayload([event('Nationals',2600,75314)])),{data:null,error:new Error('Calendar unavailable')});
  await assert.rejects(api.fetchTournamentWins({profile:{rankings:[{ranking_participant_id:201351,age_group_id:82}]}}),/Calendar unavailable/);
});

test('ranking snapshots retain provider totals and reject another participant or age group',async()=>{
  const payload=pointPayload([event('A counted contribution',500,1)]);
  payload.ParticipantWithPoints.Participant={Id:201351};
  payload.ParticipantWithPoints.ParticipantPoints={AgeGroup:82,Points:14320,Standing:1};
  const api=load(null,async()=>response(payload));
  const snapshot=await api.fetchPointSnapshot('201351',82,false);
  assert.equal(snapshot.points,14320);assert.equal(snapshot.rank,1);assert.equal(snapshot.results.length,1);
  await assert.rejects(api.fetchPointSnapshot('999',82,false),/different ranking participant/);
  await assert.rejects(api.fetchPointSnapshot('201351',83,false),/different age group/);
});
