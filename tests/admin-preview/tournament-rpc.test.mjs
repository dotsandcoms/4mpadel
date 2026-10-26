import test from 'node:test';
import assert from 'node:assert/strict';
import { createTournamentClient } from '../../src/pages/admin-preview/tournament/rpcClient.js';
import { visibleWorkspaces, defaultWorkspace } from '../../src/pages/admin-preview/tournament/utils/tournament/permissions.js';
const fixture = () => {
  const calls = [];
  const db = { auth: { getUser: async () => ({ data: { user: { id:'operator' } } }) }, rpc: async (name,args) => { calls.push([name,args]); return { data:{ok:true} }; } };
  return {db,calls,client:createTournamentClient(db,{userId:'operator'})};
};
test('read snapshots do not mutate or run an auth write',async()=>{
 const {client,calls}=fixture(); await client.list(); await client.load(12);
 assert.deepEqual(calls,[['tm_list_events',{}],['tm_snapshot',{p_event:12}]]);
});
test('mutation uses current source revision contract',async()=>{
 const {client,calls}=fixture(); await client.publishDraw({event:{id:12}},{id:'draw',updated_at:'revision'});
 assert.deepEqual(calls,[['tm_publish_draw',{p_event:12,p_draw:'draw',p_expected:'revision'}]]);
});
test('switched identity, missing identity and scoped workspace cannot mutate',async()=>{
 const {db,calls}=fixture(); db.auth.getUser=async()=>({data:{user:{id:'different'}}});
 for(const options of [{userId:'operator'},{},{userId:'operator',scopeId:'club-1'}]) await assert.rejects(createTournamentClient(db,options).finalise({event:{id:12}},'d'));
 assert.equal(calls.length,0);
});
test('backend response error and database error are never success',async()=>{
 const {db}=fixture(); db.rpc=async()=>({data:{error:'stale snapshot'}});
 await assert.rejects(createTournamentClient(db).load(12),/stale snapshot/);
 db.rpc=async()=>({error:{code:'PGRST202',message:'missing'}});
 await assert.rejects(createTournamentClient(db).list(),/unavailable/);
});
test('results and finance roles keep current source tabs',()=>{
 assert.equal(defaultWorkspace(['results']),'results');
 assert.deepEqual(visibleWorkspaces(['finance']).map(x=>x[0]),['overview','finances','activity']);
 assert.ok(visibleWorkspaces(['corrections']).some(x=>x[0]==='results'));
 assert.ok(!visibleWorkspaces(['results']).some(x=>x[0]==='access'));
});
test('context invalidation blocks a second sequential mutation',async()=>{
 const {db,calls}=fixture();let active=true;
 const client=createTournamentClient(db,{userId:'operator',isCurrent:()=>active});
 await client.saveSettings({event:{id:12},settingsRevision:1},{},[]);
 active=false;
 await client.load(12);
 await assert.rejects(client.finalise({event:{id:12}},'d'),/context changed/);
 assert.deepEqual(calls.map(x=>x[0]),['tm_save_settings','tm_snapshot']);
});
test('context is rechecked after the asynchronous identity check',async()=>{
 const {db,calls}=fixture();let active=true;
 db.auth.getUser=async()=>{active=false;return {data:{user:{id:'operator'}}};};
 const client=createTournamentClient(db,{userId:'operator',isCurrent:()=>active});
 await assert.rejects(client.finalise({event:{id:12}},'d'),/context changed/);
 assert.equal(calls.length,0);
});
test('void mutation receipt remains valid and failure never claims rollback',async()=>{
 const {db}=fixture();db.rpc=async()=>({data:null,error:null});
 const client=createTournamentClient(db,{userId:'operator'});
 assert.equal(await client.finalise({event:{id:12}},'d'),null);
 db.rpc=async()=>({error:{code:'PGRST202'}});
 await assert.rejects(client.finalise({event:{id:12}},'d'),error=>!error.message.includes('no changes'));
});
