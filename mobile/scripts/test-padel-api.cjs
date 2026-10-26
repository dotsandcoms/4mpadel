const test=require('node:test'),assert=require('node:assert/strict');
let api;test.before(async()=>{api=await import('../supabase/functions/_shared/padel-api.mjs');});
const resource='https://padelapi.org/api/tournaments?page=1';
function database(max=1400){const cache=new Map(),leases=new Set();let calls=0,pause=null;return{cache,leases,get calls(){return calls;},get pause(){return pause;},rpc:async(name,args)=>{
 if(name==='claim_padel_request'){
  const hit=cache.get(args.p_key);
  if(hit&&!hit.expired)return{data:{action:'cached',...hit}};
  if(pause||calls>=max)return{data:hit?{action:'stale',...hit,reason:'day_budget'}:{action:'paused',retry_at:new Date(Date.now()+60000).toISOString()}};
  if(leases.has(args.p_key))return{data:hit?{action:'stale',...hit}:{action:'wait'}};
  leases.add(args.p_key);calls++;return{data:{action:'fetch',lease_id:'test',request_id:calls}};
 }
 if(name==='save_padel_response'){assert.ok(!JSON.stringify(args).includes('private-token'));cache.set(args.p_key,{payload:args.p_payload,fetched_at:new Date().toISOString()});}
 if(name==='pause_padel_api')pause=args.p_until;
 if(name==='finish_padel_request')leases.delete(args.p_key);
 if(name==='stale_padel_response')return{data:cache.get(args.p_key)||null};
 return{data:null};
}};}
const sleep=()=>new Promise(resolve=>setImmediate(resolve));
test('Retry-After is a retry time and handles seconds, HTTP dates and invalid headers',()=>{
 const now=Date.parse('2026-10-07T12:00:00Z');
 assert.equal(api.retryAfterDate(new Response('',{headers:{'Retry-After':'3600'}}),now),'2026-10-07T13:00:00.000Z');
 assert.equal(api.retryAfterDate(new Response('',{headers:{'Retry-After':'Wed, 07 Oct 2026 14:00:00 GMT'}}),now),'2026-10-07T14:00:00.000Z');
 assert.equal(api.retryAfterDate(new Response('',{headers:{'Retry-After':'invalid'}}),now),'2026-10-07T12:01:00.000Z');
 assert.match(api.rateLimitMessage('2026-10-08T05:00:00Z'),/07:00 SAST/);assert.match(api.rateLimitMessage('2026-10-08T05:00:00Z'),/attempted/);
});
test('2,000 simultaneous mobile and web cold-cache viewers share ONE provider request',async()=>{
 const db=database();let calls=0;
 const upstream=async()=>{calls++;await sleep();return Response.json({data:[{id:746,status:'live'}]});};
 const results=await Promise.all(Array.from({length:2000},(_,i)=>api.createPadelFetch(db,upstream,{sleep})(i%2?resource:'https://padelapi.org/api/tournaments?page=1',{headers:{Authorization:'Bearer private-token'}})));
 assert.equal(calls,1);assert.equal(db.calls,1);assert.equal(results.length,2000);assert.ok(results.every(r=>r.status===200));
 assert.equal((await results[1999].json()).data[0].id,746);
});
test('canonical keys unify query ordering, live page 1 and country-name batch ordering',()=>{
 assert.equal(api.canonicalPadelUrl('https://padelapi.org/api/live?per_page=50').href,api.canonicalPadelUrl('https://padelapi.org/api/live?page=1&per_page=50').href);
 assert.equal(api.canonicalPadelUrl('https://padelapi.org/api/players?per_page=50&name=Bob,Alice').href,api.canonicalPadelUrl('https://padelapi.org/api/players?name=Alice,Bob&per_page=50').href);
});
test('provider low-remaining headers pause fresh traffic before reaching zero',async()=>{
 const db=database();let calls=0;
 const fetcher=api.createPadelFetch(db,async()=>{calls++;return Response.json({data:[]},{headers:{'x-ratelimit-limit':'60','x-ratelimit-remaining':'4'}});});
 assert.equal((await fetcher(resource)).status,200);assert.ok(db.pause);
 await assert.rejects(fetcher('https://padelapi.org/api/players/12'),/next refresh/);
 assert.equal((await fetcher(resource)).status,200);assert.equal(calls,1);
});
test('429 keeps dated saved content available and stops uncached provider calls',async()=>{
 const db=database();db.cache.set(api.canonicalPadelUrl(resource).href,{payload:{data:[{id:746}]},fetched_at:'2026-10-07T12:00:00Z',expired:true});let calls=0;
 const read=api.createPadelFetch(db,async()=>{calls++;return new Response('',{status:429,headers:{'Retry-After':'600'}});});
 const response=await read(resource);assert.equal(response.headers.get('x-4m-cache'),'stale');assert.equal(response.headers.get('x-4m-fetched-at'),'2026-10-07T12:00:00Z');
 await assert.rejects(api.createPadelFetch(db,()=>assert.fail())('https://padelapi.org/api/players/12'),/next refresh/);assert.equal(calls,1);
});
test('account budget blocks a new resource without contacting the provider; existing data still serves',async()=>{
 const db=database(1);let calls=0;const read=api.createPadelFetch(db,async()=>{calls++;return Response.json({data:[]});});
 await read(resource);await assert.rejects(read('https://padelapi.org/api/players/12'),/next refresh/);await read(resource);assert.equal(calls,1);
});
test('a cache outage fails closed instead of bypassing the shared provider governor',async()=>{
 const read=api.createPadelFetch({rpc:async()=>({error:{message:'database unavailable'}})},()=>assert.fail('Provider must not be called'));
 await assert.rejects(read(resource),/shared international cache/);
});
test('non-provider traffic is unaffected, completed matches persist and live checks are bounded',async()=>{
 let calls=0;const read=api.createPadelFetch(database(),async()=>{calls++;return Response.json({ok:true});});await read('https://api.rankedin.com/v1/test');assert.equal(calls,1);
 assert.equal(api.padelCacheSeconds(new URL('https://padelapi.org/api/live')),120);
 assert.equal(api.padelCacheSeconds(new URL('https://padelapi.org/api/matches/1'),{status:'finished'}),604800);
 assert.equal(api.padelCacheSeconds(new URL('https://padelapi.org/api/players?name=Mark')),86400);
});
