import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecoveryHandler } from '../supabase/functions/admin-authenticator-recovery/handler.mjs';
const approval={userId:'target-user',email:'other@example.test',factorIds:['lost-primary','lost-backup'],requestId:'reviewed-request',execute:true};
function fixture(options={}){
 const calls=[];
 const caller={auth:{getUser:async()=>options.badToken?{error:{message:'bad token'}}:{data:{user:{id:'actor-user'}}}},rpc:async(name,args)=>{calls.push({name,args});return options.authorisationError?{error:{message:options.authorisationError}}:{data:options.approval||approval};}};
 const worker={auth:{admin:{mfa:{deleteFactor:async args=>{calls.push({delete:args});if(options.throwDelete)throw new Error('PRIVATE_INTERNAL_DETAIL');return options.failId===args.id?{error:{message:'PRIVATE_INTERNAL_DETAIL'}}:{data:{id:args.id}};}}}},rpc:async(name,args)=>{calls.push({name,args});return options.failAudit?{error:{message:'PRIVATE_INTERNAL_DETAIL'}}:{data:null};}};
 const handler=createRecoveryHandler({url:'https://example.supabase.co',key:'public-key',serviceKey:'private-worker-key',createClient(_url,key){calls.push({client:key==='private-worker-key'?'worker':'caller'});return key==='private-worker-key'?worker:caller;}});
 const request=(body={action:'reset',email:'other@example.test'},extra={})=>handler(new Request('https://example.test/recovery',{method:'POST',headers:{authorization:'Bearer test-token',origin:'https://4mpadel.co.za',...extra.headers},body:JSON.stringify(body),...extra}));
 return {calls,request,handler};
}
test('anonymous, invalid-token and disallowed-origin requests cannot construct a service client',async()=>{
 for(const opts of [{},{badToken:true}]){const f=fixture(opts);const response=await f.request(undefined,opts.badToken?{}:{headers:{origin:'https://4mpadel.co.za'}});assert.equal(response.status,401);assert.ok(!f.calls.some(c=>c.client==='worker'));}
 const f=fixture();const r=await f.request(undefined,{headers:{authorization:'Bearer test-token',origin:'https://evil.example'}});assert.equal(r.status,403);assert.equal(f.calls.length,0);
});
test('fresh MFA and true Super Admin authorisation are required before privileged API access',async()=>{
 for(const code of ['RECOVERY_MFA_REQUIRED','RECOVERY_SUPER_ADMIN_REQUIRED','RECOVERY_SIGN_IN']){const f=fixture({authorisationError:code});const r=await f.request();assert.equal(r.status,code==='RECOVERY_SIGN_IN'?401:403);assert.equal((await r.json()).error,code);assert.ok(!f.calls.some(c=>c.client==='worker'));}
});
test('lookup and history never instantiate an administrative Auth client',async()=>{
 for(const action of ['lookup','history']){const f=fixture({approval:{email:'other@example.test',factors:[]}});const r=await f.request({action,email:'other@example.test'});assert.equal(r.status,200);assert.ok(!f.calls.some(c=>c.client==='worker'));}
});
test('reset deletes only the canonical user and exact approved factor IDs, then records the result',async()=>{
 const f=fixture();const r=await f.request({action:'reset',userId:'forged-user',factorIds:['forged-factor']});
 assert.equal(r.status,200);assert.equal((await r.json()).state,'completed');
 assert.deepEqual(f.calls.filter(c=>c.delete).map(c=>c.delete),[{userId:'target-user',id:'lost-primary'},{userId:'target-user',id:'lost-backup'}]);
 assert.deepEqual(f.calls.at(-1),{name:'finish_authenticator_recovery',args:{p_request:'reviewed-request',p_removed:['lost-primary','lost-backup'],p_success:true}});
});
test('a duplicate approval never repeats the privileged reset',async()=>{
 const f=fixture({approval:{requestId:'reviewed-request',state:'completed',execute:false}});const r=await f.request();assert.equal(r.status,200);assert.ok(!f.calls.some(c=>c.client==='worker'));
});
test('a partial failure records exactly what was removed and never exposes underlying Auth errors',async()=>{
 const f=fixture({failId:'lost-backup'});const r=await f.request();const body=await r.text();assert.equal(r.status,502);assert.doesNotMatch(body,/PRIVATE_INTERNAL_DETAIL|private-worker-key/);
 assert.deepEqual(f.calls.at(-1).args,{p_request:'reviewed-request',p_removed:['lost-primary'],p_success:false});
});
test('a thrown Auth network error still records an incomplete recovery',async()=>{
 const f=fixture({throwDelete:true});const r=await f.request();assert.equal(r.status,502);assert.deepEqual(f.calls.at(-1).args,{p_request:'reviewed-request',p_removed:[],p_success:false});
});
test('an audit completion failure asks for review instead of claiming success',async()=>{
 const f=fixture({failAudit:true});const r=await f.request();assert.equal(r.status,503);assert.equal((await r.json()).error,'RECOVERY_REVIEW_REQUIRED');
});
test('unknown database errors are redacted and do not call Auth administration',async()=>{
 const f=fixture({authorisationError:'PRIVATE_DATABASE_DETAIL'});const r=await f.request();assert.equal(r.status,403);assert.doesNotMatch(await r.text(),/PRIVATE_DATABASE_DETAIL/);assert.ok(!f.calls.some(c=>c.client==='worker'));
});
