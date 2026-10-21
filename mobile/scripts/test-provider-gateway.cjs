const test=require('node:test'),assert=require('node:assert/strict');let handler,shared;
test.before(async()=>{handler=await import('../supabase/functions/pro-padel-provider/handler.mjs');shared=await import('../../server/padel-api.mjs');});
const credential='private-provider-credential';
const request=(input,token=credential)=>new Request('https://server.test/',{method:'POST',headers:{Authorization:`Bearer ${token}`},body:JSON.stringify(input)});
test('gateway rejects unauthenticated calls before reading database or provider',async()=>{
 const response=await handler.handleProvider(request({url:'https://padelapi.org/api/live'},'wrong'),{secret:credential,client:{rpc:()=>assert.fail()},fetcher:()=>assert.fail()});assert.equal(response.status,401);
});
test('gateway rejects arbitrary hosts, private resources, oversized pages and invalid methods',async()=>{
 for(const input of [{url:'https://evil.test/api/live'},{url:'https://padelapi.org/api/logs'},{url:'https://padelapi.org/api/players?per_page=1000'},{url:'https://padelapi.org/api/live',method:'DELETE'},{url:'https://padelapi.org/api/matches/headtohead',method:'POST',body:'{"team_1":[],"team_2":[]}'}]){
  const response=await handler.handleProvider(request(input),{secret:credential,client:{rpc:()=>assert.fail()},fetcher:()=>assert.fail()});assert.equal(response.status,400);
 }
});
test('valid website requests use the shared cache and preserve freshness headers',async()=>{
 const response=await handler.handleProvider(request({url:'https://padelapi.org/api/live'}),{secret:credential,client:{rpc:async(name)=>{assert.equal(name,'claim_padel_request');return{data:{action:'stale',payload:{data:[]},fetched_at:'2026-10-08T06:00:00Z',reason:'day_budget'}};}},fetcher:()=>assert.fail()});assert.equal(response.status,200);assert.equal(response.headers.get('x-4m-cache'),'stale');assert.equal(response.headers.get('x-4m-fetched-at'),'2026-10-08T06:00:00Z');assert.doesNotMatch(await response.text(),/credential/);
});
test('web proxy uses existing private credential without a database admin key',async()=>{
 let calls=0;const fetcher=shared.createSharedProviderFetch(async(url,init)=>{calls++;assert.equal(url,'https://supabase.test/functions/v1/pro-padel-provider');assert.equal(init.headers.Authorization,`Bearer ${credential}`);assert.equal(JSON.parse(init.body).url,'https://padelapi.org/api/players/12');return Response.json({id:12});},{VITE_SUPABASE_URL:'https://supabase.test',PADEL_API_TOKEN:credential});assert.equal((await fetcher('https://padelapi.org/api/players/12')).status,200);assert.equal(calls,1);
});
test('web proxy preserves POST bodies and passes unrelated traffic through',async()=>{
 const seen=[];const fetcher=shared.createSharedProviderFetch(async(url,init)=>{seen.push({url,init});return Response.json({});},{VITE_SUPABASE_URL:'https://supabase.test',PADEL_API_TOKEN:credential});await fetcher('https://padelapi.org/api/matches/headtohead',{method:'POST',body:JSON.stringify({team_1:[1],team_2:[2]})});assert.equal(JSON.parse(seen[0].init.body).method,'POST');assert.equal(JSON.parse(JSON.parse(seen[0].init.body).body).team_1[0],1);await fetcher('https://www.padelfip.com/calendar/');assert.equal(seen[1].url,'https://www.padelfip.com/calendar/');
});
