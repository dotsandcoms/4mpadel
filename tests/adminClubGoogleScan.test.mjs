import assert from 'node:assert/strict';
import test from 'node:test';
import { createClubGoogleScanHandler } from '../supabase/functions/_shared/club-google-scan-handler.mjs';

const uuid = value => `01234567-0000-4000-8000-${String(value).padStart(12,'0')}`;

function fixture(options = {}) {
  const calls = [];
  const count = options.count ?? 5;
  const club = id => ({ id:uuid(id), name:`Club ${id}`, row_version:'41' });
  const listed = Array.from({length:count},(_,index)=>club(index+1));
  const reviewed = new Map([[uuid(count+1),'dismissed']]);
  const state = new Map([ ...reviewed ]);
  let checks = 0;
  const handler = createClubGoogleScanHandler({
    connect() {
      return { identify:async()=>options.signedOut?null:'synthetic-actor', authorised:async()=>{
        checks++;
        return !options.denied && (!options.revoked || checks===1);
      } };
    },
    candidates:async ({ after,limit }) => {
      calls.push(['candidates',after,limit]);
      return listed.filter(club => (!after || club.id > after) && !state.has(club.id)).slice(0,limit+1);
    },
    scan:async club => {
      calls.push(['provider',club.id]);
      if (options.failed?.includes(club.id)) throw new Error('Provider details stay server-side');
      return { match_status:'matched', google_place_id:`place-${club.id}` };
    },
    enqueue:async (club,match) => {
      calls.push(['enqueue',club.id,match]);
      if (options.skipped?.includes(club.id) || state.has(club.id)) return false;
      state.set(club.id,'pending');
      return true;
    },
    configured:()=> options.configured !== false,
    places:options.places ? {
      search:async query => {calls.push(['places',query]); return options.places.search;},
      details:async placeId => {calls.push(['details',placeId]); return options.places.details;},
    } : undefined,
  });
  function run(body = {}, token = 'synthetic-open-session') {
    return handler(new Request('https://local.invalid/scan', { method:'POST',
      headers:token ? {Authorization:`Bearer ${token}`,'Content-Type':'application/json'} : {},
      body:JSON.stringify(body) }));
  }
  return { calls,state,run };
}

test('only a verified active platform actor can reach the worker or Google',async()=>{
  const anonymous=fixture();
  assert.equal((await anonymous.run({},null)).status,401);
  assert.deepEqual(anonymous.calls,[]);
  const signedOut=fixture({signedOut:true});
  assert.equal((await signedOut.run()).status,401);
  assert.deepEqual(signedOut.calls,[]);
  const nonPlatform=fixture({denied:true});
  assert.equal((await nonPlatform.run()).status,403);
  assert.deepEqual(nonPlatform.calls,[]);
  const disabled=fixture({configured:false});
  assert.equal((await disabled.run()).status,503);
  assert.deepEqual(disabled.calls,[]);
});

test('fresh platform authority is checked again before queued writes',async()=>{
  const f=fixture({revoked:true});
  assert.equal((await f.run()).status,403);
  assert.ok(f.calls.some(([name])=>name==='provider'));
  assert.equal(f.calls.some(([name])=>name==='enqueue'),false);
});

test('scans progress past failed candidates and preserve their clean retry path',async()=>{
  const first=uuid(1), second=uuid(2), third=uuid(3), fourth=uuid(4);
  const f=fixture({failed:[first],skipped:[second]});
  const one=await (await f.run({limit:2})).json();
  assert.deepEqual(one,{scan_version:1,processed:2,queued:0,skipped:1,
    errors:[{club:'Club 1',message:'Google returned no usable response for this club.'}],next_cursor:second});
  const two=await (await f.run({limit:2,after:one.next_cursor})).json();
  assert.deepEqual(two,{scan_version:1,processed:2,queued:2,skipped:0,errors:[],next_cursor:fourth});
  const three=await (await f.run({limit:2,after:two.next_cursor})).json();
  assert.equal(three.next_cursor,null);
  assert.equal(f.state.get(third),'pending');
  assert.equal(f.state.get(uuid(6)),'dismissed');
  const restarted=await (await f.run({limit:2})).json();
  assert.equal(restarted.errors.length,1);
  assert.equal(restarted.next_cursor,null);
  assert.equal(f.calls.filter(([kind,clubId])=>kind==='provider'&&clubId===first).length,2);
});

test('preserves the legacy limit request shape with a bounded batch and rejects force and malformed cursors',async()=>{
  const f=fixture({count:30});
  for (const input of [{force:true},{after:'bad-id'},{limit:2.4},{limit:-1},{scopeId:'org:foreign'}]) {
    assert.equal((await f.run(input)).status,400);
  }
  assert.deepEqual(f.calls,[]);
  const result=await (await f.run({limit:50})).json();
  assert.equal(result.processed,24);
  assert.equal(result.queued,24);
  assert.equal(result.next_cursor,uuid(24));
});

test('manual Places search accepts only an active platform actor and returns a bounded deduplicated projection',async()=>{
  const places={search:{results:[{place_id:'valid-first',name:'First Place',formatted_address:'One Fixture Road',private_field:'never returned'},
    {place_id:'valid-first',name:'Duplicate'},{place_id:'https://invalid',name:'Unsafe ID'},
    ...Array.from({length:30},(_,index)=>({place_id:'fixture-'+index,name:'Fixture '+index}))]}};
  const denied=fixture({denied:true,places});
  assert.equal((await denied.run({action:'search',query:'Fixture courts'})).status,403);
  assert.deepEqual(denied.calls,[]);
  const revoked=fixture({revoked:true,places});
  assert.equal((await revoked.run({action:'search',query:'Fixture courts'})).status,403);
  assert.deepEqual(revoked.calls,[['places','Fixture courts']]);
  const accepted=fixture({places});
  assert.equal((await accepted.run({action:'search',query:'x'.repeat(161)})).status,400);
  assert.equal((await accepted.run({action:'search',query:'Fixture',limit:40})).status,400);
  const result=await (await accepted.run({action:'search',query:'  Fixture courts  '})).json();
  assert.equal(result.place_version,1);
  assert.equal(result.results.length,12);
  assert.deepEqual(result.results[0],{place_id:'valid-first',name:'First Place',formatted_address:'One Fixture Road'});
  assert.deepEqual(accepted.calls,[['places','Fixture courts']]);
  const legacy=fixture();
  assert.equal((await legacy.run({action:'search',query:'Fixture courts'})).status,400);
  assert.deepEqual(legacy.calls,[]);
});

test('manual Places details require the exact requested ID, project review fields and never call the worker',async()=>{
  const details={place_id:'selected-place',name:'Exact Fixture',formatted_address:'One Fixture Road',
    geometry:{location:{lat:0,lng:29},viewport:{private:'ignored'}},
    address_components:[{long_name:'Synthetic City',types:['locality','political']},{long_name:'Ignored',types:['route']}],
    opening_hours:{periods:[{open:{day:1,time:'0900'},close:{day:1,time:'1700'}},{open:{day:2,time:'8800'}}]},
    international_phone_number:'+27 00 000 0000',website:'javascript:alert(1)',url:'https://maps.google.com/maps?q=fixture',
    rating:4.1,user_ratings_total:3,business_status:'OPERATIONAL',private_field:'never returned'};
  const f=fixture({places:{details:{result:details}}});
  assert.equal((await f.run({action:'details',place_id:514})).status,400);
  assert.equal((await f.run({action:'details',place_id:'ignored',url:'https://example.invalid'})).status,400);
  assert.equal((await f.run({action:'details',place_id:'different-place'})).status,502);
  const result=await (await f.run({action:'details',place_id:'selected-place'})).json();
  assert.deepEqual(result,{place_version:1,place:{
    place_id:'selected-place',name:'Exact Fixture',formatted_address:'One Fixture Road',
    address_components:[{long_name:'Synthetic City',types:['locality']}],
    geometry:{location:{lat:0,lng:29}},opening_hours:{periods:[{open:{day:1,time:'0900'},close:{day:1,time:'1700'}}]},
    international_phone_number:'+27 00 000 0000',website:null,rating:4.1,user_ratings_total:3,
    url:'https://maps.google.com/maps?q=fixture',business_status:'OPERATIONAL',
  }});
  assert.deepEqual(f.calls,[['details','different-place'],['details','selected-place']]);
});
