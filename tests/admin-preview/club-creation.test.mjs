import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyClubCreationAccess } from '../../src/pages/admin-preview/clubCreation.js';
function mock({email='admin@example.invalid',id='actor',active=true,allowed=true,rpcError=null,finalUser}={}) {
  const calls=[];let checks=0;
  return {calls,auth:{getUser:async()=>{calls.push(['getUser']);checks++;return{data:{user:checks>1&&finalUser!==undefined?finalUser:{id,email}}};}},rpc:async(name,args)=>{calls.push([name,args]);return{data:name==='account_is_active'?active:allowed,error:rpcError};},from:()=>{throw Error('No table access or writes permitted');}};
}
test('only global scope can attempt creation',async()=>{for(const scope of [undefined,null,'','club:1','org:1']){const client=mock();await assert.rejects(verifyClubCreationAccess(client,scope),/Platform Clubs/);assert.equal(client.calls.length,0);}});
test('opening actor must match before authority lookup',async()=>{const client=mock();await assert.rejects(verifyClubCreationAccess(client,'all','other'),/account changed/);assert.deepEqual(client.calls,[['getUser']]);});
test('valid authenticated identity required',async()=>{for(const options of [{email:null},{email:''},{email:' '},{id:null}])await assert.rejects(verifyClubCreationAccess(mock(options),'all'),/Sign in/);});
test('active account and strict true authority required; RPC errors fail closed',async()=>{for(const options of [{active:false},{active:null},{allowed:false},{allowed:'true'},{rpcError:{message:'unavailable'}}])await assert.rejects(verifyClubCreationAccess(mock(options),'all'));});
test('literal wildcard email reaches exact RPC without ILIKE or table writes',async()=>{const email='Admin*_%@example.invalid',client=mock({email});assert.equal(await verifyClubCreationAccess(client,'all','actor'),true);assert.deepEqual(client.calls,[['getUser'],['account_is_active',undefined],['is_super_admin',{user_email:email}],['getUser']]);});
test('actor/email switched after RPC is rejected even without expected ID',async()=>{for(const finalUser of [{id:'other',email:'admin@example.invalid'},{id:'actor',email:'changed@example.invalid'},null])await assert.rejects(verifyClubCreationAccess(mock({finalUser}),'all'),/account changed/);});
test('each attempt rechecks identity and permission without writes',async()=>{const client=mock();await verifyClubCreationAccess(client,'all');await verifyClubCreationAccess(client,'all');assert.equal(client.calls.filter(([name])=>name==='getUser').length,4);});
test('permission RPC error rejects even with a true data value',async()=>{
  const client=mock();
  client.rpc=async name=>name==='account_is_active'?{data:true}:{data:true,error:{message:'permission unavailable'}};
  await assert.rejects(verifyClubCreationAccess(client,'all','actor'),/verified super-admin/);
});
