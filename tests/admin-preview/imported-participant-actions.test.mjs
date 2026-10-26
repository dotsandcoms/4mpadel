import test from 'node:test';import assert from 'node:assert/strict';
import {saveImportedParticipant,searchImportedProfiles,importedHeldAction} from '../../src/pages/admin-preview/importedParticipantActions.js';
const participant={id:'p',event_id:7,full_name:'Synthetic Player',class_name:'Open',rankedin_participant_id:'123',profile_id:null,whatsapp_added:false},profile={id:2,name:'Synthetic Player',email:'player@example.invalid'};
function mock({admin=true,changed=false,empty=false,actor='actor'}={}){const state={writes:[],rpcs:[]};const client={state,auth:{getUser:async()=>({data:{user:{id:actor,email:'admin@example.invalid'}}})},rpc(name){state.rpcs.push(name);return Promise.resolve({data:name==='can_manage_event'?true:admin});},from(table){let patch=null,start=0;const filters=[];return{select(){return this;},update(value){patch=value;return this;},eq(key,value){filters.push([key,value]);return this;},is(key,value){filters.push([key,value]);return this;},order(){return this;},range(value){start=value;return this;},abortSignal(){return this;},single(){if(patch){state.writes.push({table,patch,filters});return Promise.resolve({data:empty?null:{...participant,...patch}});}return Promise.resolve({data:table==='calendar'?{id:7,organisation_id:'org',club_id:'club'}:table==='players'?profile:{...participant,...(changed?{profile_id:99}:{})}});},then(resolve){return Promise.resolve({data:start?[]:[profile]}).then(resolve);}};}};return client;}
const args=client=>({client,eventId:7,expectedUserId:'actor',participant,scopeId:'all'});
test('WhatsApp writes only source checklist field, with full exact snapshot filters',async()=>{const c=mock();await saveImportedParticipant({...args(c),action:'whatsapp'});assert.deepEqual(c.state.writes[0].patch,{whatsapp_added:true});assert.equal(c.state.writes[0].filters.length,7);assert.equal(c.state.rpcs.filter(x=>x==='is_super_admin').length,2);});
test('profile writes only profile_id after verifying selected raw profile',async()=>{const c=mock();await saveImportedParticipant({...args(c),action:'profile',profile});assert.deepEqual(c.state.writes[0].patch,{profile_id:2});});
test('active account and exact authenticated email authority are required',async()=>{
  const c=mock(), calls=[];
  const rpc=c.rpc;
  c.rpc=(name,payload)=>{calls.push({name,payload});return rpc(name,payload);};
  await saveImportedParticipant({...args(c),action:'whatsapp'});
  assert.deepEqual(calls.filter(row=>row.name==='is_super_admin').map(row=>row.payload),[{user_email:'admin@example.invalid'},{user_email:'admin@example.invalid'}]);
  assert.equal(calls.filter(row=>row.name==='account_is_active').length,2);
  for(const response of [{data:false},{data:null},{data:true,error:Error('denied')}]){
    const denied=mock(), originalRpc=denied.rpc;
    denied.rpc=(name,payload)=>name==='account_is_active'?Promise.resolve(response):originalRpc(name,payload);
    await assert.rejects(saveImportedParticipant({...args(denied),action:'whatsapp'}),/active account/);
    assert.equal(denied.state.writes.length,0);
  }
});
test('actor mismatch, delegated access, stale participant, scope mismatch and stale context prevent writes',async()=>{for(const [config,extra] of [[{actor:'other'},{}],[{admin:false},{}],[{changed:true},{}],[{},{scopeId:'club:other'}],[{},{isCurrent:()=>false}]]){const c=mock(config);await assert.rejects(saveImportedParticipant({...args(c),action:'whatsapp',...extra}));assert.equal(c.state.writes.length,0);}});
test('missing receipt is uncertain, unsupported finance/sync writes are impossible',async()=>{await assert.rejects(saveImportedParticipant({...args(mock({empty:true})),action:'whatsapp'}),/could not be confirmed/);for(const action of ['sync','payment']){const c=mock();await assert.rejects(saveImportedParticipant({...args(c),action}));assert.equal(c.state.writes.length,0);assert(importedHeldAction(action).includes('held for review'));}});
test('profile search paginates source fields and uses local literal matching',async()=>{const c=mock();assert.deepEqual(await searchImportedProfiles({...args(c),query:'synthetic'}),[profile]);assert.deepEqual(await searchImportedProfiles({...args(c),query:'%' }),[]);assert.equal(c.state.writes.length,0);});
