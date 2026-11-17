const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync('supabase/functions/native-club-places/index.ts','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function server(options = {}) {
  let handler;
  const calls = [], queries = [], clients = [];
  const club = options.club === null ? null : { id: 'public-club', status: 'published', google_place_id: 'linked-place', ...options.club };
  const client = { auth: { getUser: async () => ({ data: { user: options.signedOut ? null : { id: 'account-id' } } }) }, from(table) {
    const query = { table }; queries.push(query);
    const chain = { select(fields) { query.fields=fields; return this; }, eq(field,value) { query.eq=[field,value]; return this; }, in(field,value) { query.in=[field,value]; return this; }, maybeSingle: async () => ({ data: club, error: options.databaseError ? new Error('private error') : null }) };
    return chain;
  } };
  const place = { place_id: 'linked-place', name: 'Club', rating: 4.8, user_ratings_total: 12, url: 'https://maps.google.com/?cid=123', website: 'https://club.test', international_phone_number: '+27 11 123 4567', opening_hours: { open_now: true, weekday_text: ['Monday: 5:00 AM – 11:00 PM'] }, photos: [{ photo_reference: 'private-photo-reference', html_attributions: ['<a href="https://maps.google.com/author">Venue owner</a>'] }], reviews: [{ author_name: 'Reviewer', author_url: 'https://maps.google.com/author', rating: 5, text: 'Excellent courts', relative_time_description: 'a month ago' }], ...options.place };
  vm.runInNewContext(source, { exports: {}, require: () => ({ createClient: (url,key,config) => { clients.push({url,key,config}); return client; } }), Deno: { env: { get: name => name === 'GOOGLE_MAPS_API_KEY' ? options.noKey ? '' : 'server-secret-key' : name === 'SUPABASE_SERVICE_ROLE_KEY' ? 'DO-NOT-USE' : 'public-key' }, serve: fn => handler=fn }, Response, URL, AbortSignal, Date,
    fetch: async (url, config) => { calls.push({ url: String(url), config });
      if (String(url).includes('/photo?')) return new Response(null, { status: 302, headers: { location: options.photoLocation || 'https://lh3.googleusercontent.com/club-image' } });
      if (options.slow) await options.slow;
      return Response.json({ status: options.googleError ? 'REQUEST_DENIED' : 'OK', error_message: 'server-secret-key', result: place });
    } });
  return { calls, queries, clients, async call(body={slug:'club'}, authorization='Bearer test-user') { const response = await handler(new Request('https://functions.test/native-club-places', { method:'POST', headers: { authorization }, body: JSON.stringify(body) })); return { status:response.status, headers:response.headers, body:await response.json() }; } };
}
test('Google club data requires a verified Auth user before database/provider access',async()=>{
  for (const options of [{signedOut:true},{}]) {
    const app=server(options), result=await app.call({slug:'club'},options.signedOut?'Bearer bad':'');
    assert.equal(result.status,401); assert.equal(app.calls.length,0); assert.equal(app.queries.length,0);
  }
});
test('only a linked published club can make a Google request, using caller RLS and no service key',async()=>{
  for(const club of [null,{status:'draft'},{google_place_id:null}]) {
    const app=server({club}),r=await app.call();
    assert.equal(app.calls.length,0); assert.equal(r.status,club?.google_place_id===null?200:404);
    assert.ok(app.clients.every(value=>value.key!=='DO-NOT-USE'));
  }
});
test('live response includes current reviews/photos and attributions without keys or photo references',async()=>{
  const app=server(),r=await app.call({slug:'club',placeId:'attacker-place',url:'https://attacker.test'});
  assert.equal(r.status,200); assert.equal(r.headers.get('cache-control'),'no-store');
  assert.equal(r.body.place.rating,4.8);assert.equal(r.body.place.reviewCount,12);
  assert.equal(r.body.place.photos[0].attributions[0].name,'Venue owner');
  assert.equal(r.body.place.reviews[0].author,'Reviewer');
  assert.equal(new URL(app.calls[0].url).searchParams.get('place_id'),'linked-place');
  assert.deepEqual(Array.from(app.queries[0].in[1]),['published','4m_approved','4m_premium']);
  assert.equal(app.queries[0].fields,'id,status,google_place_id');
  assert.ok(!JSON.stringify(r.body).includes('server-secret-key')); assert.ok(!JSON.stringify(r.body).includes('private-photo-reference'));
  assert.equal(app.calls[1].config.redirect,'manual');
});
test('Google failures/missing configuration never leak provider errors, secrets or stale ratings',async()=>{
  for(const options of [{googleError:true},{noKey:true},{databaseError:true}]) {
    const r=await server(options).call(); assert.equal(r.status,503);
    assert.ok(!JSON.stringify(r.body).includes('server-secret-key')); assert.equal(r.body.place,undefined);
  }
});
test('invalid slugs are rejected and photo redirects to arbitrary hosts are discarded',async()=>{
  const app=server();for(const slug of ['../private','https://attacker.test','x'.repeat(201)])assert.equal((await app.call({slug})).status,400);
  assert.equal(app.calls.length,0);
  for(const photoLocation of ['https://attacker.test/image','https://lh3.googleusercontent.com/image?key=secret','javascript:alert(1)']) assert.equal((await server({photoLocation}).call()).body.place.photos.length,0);
});
test('provider fanout is bounded to six photos and five reviews',async()=>{
  const app=server({place:{ photos:Array.from({length:20},()=>({photo_reference:'ref'})),reviews:Array.from({length:20},()=>({author_name:'User'})) }}),r=await app.call();
  assert.equal(app.calls.length,7);assert.equal(r.body.place.photos.length,6);assert.equal(r.body.place.reviews.length,5);
});
test('rapid refreshes are limited and sequential visits request fresh Google details',async()=>{
  const app=server();for(let i=0;i<8;i++)assert.equal((await app.call()).status,200);
  const count=app.calls.length;assert.equal((await app.call()).status,429);assert.equal(app.calls.length,count);
  assert.equal(app.calls.filter(call=>call.url.includes('/details/')).length,8);
});
test('concurrent visits share only the in-flight provider request',async()=>{
  let release;const slow=new Promise(resolve=>release=resolve),app=server({slow});
  const a=app.call(),z=app.call();await new Promise(resolve=>setImmediate(resolve)); release();
  assert.equal((await a).status,200);assert.equal((await z).status,200);
  assert.equal(app.calls.filter(call=>call.url.includes('/details/')).length,1);
});
test('client does not request a device location, stores no review data and respects cancellation',async()=>{
  const module={exports:{}},calls=[];
  const code=ts.transpileModule(fs.readFileSync('src/lib/club-places.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const deps={ './supabase':{supabase:{functions:{invoke:async(name,input)=>{calls.push({name,input});return {data:{place:{rating:4.8,reviewCount:12,reviews:[]}}};}}}}, './clubs':{publicUrl:value=>typeof value==='string'&&value.startsWith('https://')?value:null,publicPhoto:value=>typeof value==='string'&&value.startsWith('https://')?value:null} };
  vm.runInNewContext(code,{module,exports:module.exports,require:name=>deps[name]});
  const signal=new AbortController().signal;assert.equal((await module.exports.fetchClubPlace('club',signal)).rating,4.8);
  assert.deepEqual(Object.keys(calls[0].input.body),['slug']);assert.equal(calls[0].input.signal,signal);
  const aborted=new AbortController();aborted.abort();await assert.rejects(module.exports.fetchClubPlace('club',aborted.signal),/Cancelled/);
});
