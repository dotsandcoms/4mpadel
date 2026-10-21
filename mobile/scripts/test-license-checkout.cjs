const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
const code = ts.transpileModule(fs.readFileSync('supabase/functions/native-license-checkout/index.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const user = { id: '11111111-1111-1111-1111-111111111111', email: 'test@example.com' };
const attemptId = '22222222-2222-2222-2222-222222222222';
const reference = `LIC-${user.id}-${attemptId}`;
function server(options = {}) {
  let handler; const writes = [], calls = []; let issued = false;
  let saved = options.saved === null ? null : { reference, user_id: user.id, player_id: 1, amount: 525, license_type:'full', license_year:2027, event_id:null, channel:'native', ...options.saved };
  const tables = { players: { id: 1, name: 'Test', email:user.email, contact_number:options.missingPhone?'':'0123456789', license_type: options.active ? 'full' : 'none', paid_registration: !!options.active }, license_seasons:{year:2027,price:500,sales_open:options.enabled!==false}, calendar:{id:10,event_name:'Test event',start_date:'2027-02-01',end_date:'2027-02-03',allow_temporary_license:true}, commerce_config: { license_fee_percent:5,fee_label:'Service fee',temp_license_price:120,temp_license_enabled:options.enabled!==false,full_license_price: 500, license_fee_percent: 5, full_license_enabled: options.enabled !== false } };
  const client = { rpc:(name)=>Promise.resolve({data:name==='full_license_quote'?{price:options.policy?(options.priorFull?500:650):500,renewal_eligible:!!options.priorFull,starts_on:'2026-10-15',ends_on:'2027-12-31'}:{full:!!options.fullForEvent},error:null}), auth: { getUser: async () => ({ data: { user: options.signedOut ? null : user } }) }, from: table => {
    const filters = {}; const query = { then: resolve => {
      let data = table === 'native_license_checkouts' ? saved : tables[table];
      if (table === 'players') data = options.noPayer && !filters.id ? null : { ...tables.players, ...(filters.id ? { id: filters.id } : {}) };
      if (table === 'annual_licenses' || table === 'temporary_licenses') data = issued || options.active ? {id:'license-1',revoked_at:options.revoked?'2026-10-01':null} : null;
      if (table === 'native_license_checkouts' && data && Object.entries(filters).some(([k,v]) => data[k] !== v)) data = null;
      return Promise.resolve({ data, error: null }).then(resolve);
    }};
    for (const method of ['select','ilike','maybeSingle','single','is','limit']) query[method] = () => query;
    query.eq = (key,value) => { filters[key]=value; return query; };
    for (const method of ['upsert','update']) query[method] = value => { writes.push({ table, method, value }); if(table==='payments') issued=true; if (table === 'native_license_checkouts') saved = method === 'upsert' ? saved || value : {...saved, ...value}; return query; };
    return query;
  }};
  vm.runInNewContext(code, { exports: {}, require: () => ({ createClient: () => client }), Deno: { env: { get: key => key === 'PAYSTACK_SECRET_KEY' ? 'sk_live_fake' : key === 'SUPABASE_URL' ? 'https://example.supabase.co' : 'fake' }, serve: fn => handler = fn }, Response, Request, URL, AbortSignal,
    fetch: async (url, config) => { calls.push({ url, config }); return Response.json({ status: true, data: url.includes('/verify/') ? { id: 123, reference, status: 'success', domain: 'live', currency: 'ZAR', amount: 52500, customer: { email: user.email }, metadata: { native_user_id: user.id, license_type: options.saved?.license_type || 'full', license_year:options.saved?.license_year??2027 }, ...options.payment } : { authorization_url: 'https://checkout.paystack.com/test' } }); }
  });
  return { writes, calls, call: async body => { const res = await handler(new Request('https://example.test', { method: 'POST', body: JSON.stringify(body) })); return { status: res.status, body: await res.json() }; } };
}
test('anonymous requests cannot read quotes or start payments', async () => { const app=server({signedOut:true}); assert.equal((await app.call({action:'quote',licenseYear:2027})).status,401); assert.equal(app.writes.length,0); });
test('quote is server priced and never calls the gateway', async () => { const app=server(); const result=await app.call({action:'quote',licenseYear:2027,total:1}); assert.equal(result.body.quote.total,525); assert.equal(app.calls.length,0); });
test('closed sales, active licences, stale totals and missing agreement cannot start payment', async () => { for(const options of [{enabled:false},{active:true},{},{}]) { const app=server(options); const result=await app.call({action:'checkout',licenseYear:2027,attemptId,agreed:options.enabled === false || !!options.active,acceptedTotal:1}); assert.equal(result.status,400); assert.equal(app.calls.length,0); assert.equal(app.writes.length,0); } });
test('checkout initializes only the verified user and server amount', async () => { const app=server({saved:null}); const result=await app.call({action:'checkout',licenseYear:2027,attemptId,agreed:true,acceptedTotal:525,email:'other@example.com'}); assert.equal(result.status,200); const body=JSON.parse(app.calls[0].config.body); assert.equal(body.email,user.email); assert.equal(body.amount,52500); assert.equal(body.metadata.native_user_id,user.id); assert.equal(body.callback_url,'https://example.supabase.co/functions/v1/native-license-checkout/return?channel=native'); });
test('retry reuses saved payment instead of creating another gateway transaction', async () => { const app=server({saved:{authorization_url:'https://checkout.paystack.com/previous'}}); const result=await app.call({action:'checkout',licenseYear:2027,attemptId,agreed:true,acceptedTotal:525}); assert.equal(result.body.authorizationUrl,'https://checkout.paystack.com/previous'); assert.equal(app.calls.length,0); });
test('verification cannot access another player’s checkout', async () => { const app=server({saved:{user_id:'other'}}); assert.equal((await app.call({action:'verify',reference})).status,400); assert.equal(app.calls.length,0); assert.equal(app.writes.length,0); });
test('failed, underpaid, test-mode, wrong-currency and wrong-owner payments never activate a licence', async () => { for (const payment of [{status:'failed'},{amount:1},{domain:'test'},{currency:'USD'},{customer:{email:'other@example.com'}},{metadata:{native_user_id:'other',license_type:'full'}}]) { const app=server({payment}); const result=await app.call({action:'verify',reference}); assert.notEqual(result.body.paid,true); assert.equal(app.writes.length,0); } });
test('verified payment uses the webhook ledger key and activates the matching player', async () => { const app=server(); assert.equal((await app.call({action:'verify',reference})).body.paid,true); assert.equal(app.writes[0].table,'payments'); assert.equal(app.writes[0].value.reference,'123'); assert.equal(app.writes[0].value.amount,525); assert.equal(app.writes[0].value.metadata.license_year,2027); assert.equal(app.writes.some(w=>w.table==='players'),false); });

test('yearless annual requests require an app update',async()=>{const app=server();const r=await app.call({action:'quote'});assert.equal(r.status,400);assert.match(r.body.error,/Update the app/);});
test('temporary licences can be bought without a Full licence',async()=>{const app=server({saved:null});const r=await app.call({action:'quote',licenseType:'temporary',eventId:10});assert.equal(r.status,200);assert.equal(r.body.quote.base,120);assert.equal(r.body.quote.licenseYear,null);assert.equal(r.body.quote.eventId,10);});
test('a new year can be purchased by a prior-year Full holder',async()=>{const app=server({saved:null});const r=await app.call({action:'checkout',licenseYear:2027,attemptId,agreed:true,acceptedTotal:525});assert.equal(r.status,200);assert.equal(app.writes[0].value.license_year,2027);});
test('a checkout cannot be reused for another year',async()=>{const app=server({saved:{license_year:2026}});const r=await app.call({action:'checkout',licenseYear:2027,attemptId,agreed:true,acceptedTotal:525});assert.equal(r.status,400);assert.equal(app.calls.length,0);});
test('a checkout cannot be reused for another beneficiary at the same price',async()=>{const app=server({saved:{player_id:2}});const r=await app.call({action:'checkout',licenseYear:2027,attemptId,agreed:true,acceptedTotal:525});assert.equal(r.status,400);assert.equal(app.calls.length,0);assert.match(r.body.error,/different quote/);});
test('a verified payment cannot restore revoked coverage',async()=>{const app=server({revoked:true});const r=await app.call({action:'verify',reference});assert.equal(r.status,400);assert.match(r.body.error,/administrator review/);});

test('a Full licence covering the event prevents an unnecessary temporary charge',async()=>{const app=server({fullForEvent:true});const r=await app.call({action:'quote',licenseType:'temporary',eventId:10});assert.equal(r.body.quote.active,true);assert.equal(r.body.quote.coveredByFull,true);assert.equal(app.calls.length,0);});

test('Full renewals use R500 and new or temporary-only buyers use R650',async()=>{for(const priorFull of [true,false]){const app=server({policy:true,priorFull});const r=await app.call({action:'quote',licenseYear:2027});assert.equal(r.body.quote.base,priorFull?500:650);assert.equal(r.body.quote.isRenewal,priorFull);assert.equal(r.body.quote.startsOn,'2026-10-15');assert.equal(r.body.quote.endsOn,'2027-12-31');}});

test('an incomplete profile reports its missing fields and an edit link',async()=>{const app=server({missingPhone:true});const r=await app.call({action:'quote',licenseYear:2027});assert.equal(r.status,400);assert.equal(r.body.code,'PROFILE_INCOMPLETE');assert.deepEqual(r.body.missingFields,['Mobile number']);assert.equal(r.body.profileUrl,'/profile?edit=true');assert.equal(app.calls.length,0);});

test('an admin without a player profile can quote the selected completed player',async()=>{
  const app=server({noPayer:true,saved:null});
  const r=await app.call({action:'quote',licenseYear:2027,beneficiaryPlayerId:7});
  assert.equal(r.status,200);assert.equal(r.body.quote.beneficiaryName,'Test');
  assert.equal(r.body.quote.forAnotherPlayer,true);assert.equal(r.body.quote.total,525);
  assert.equal(app.calls.length,0);
});
test('checkout validates the selected player and retains the authenticated payer',async()=>{
  const app=server({noPayer:true,saved:null});
  const r=await app.call({action:'checkout',licenseYear:2027,beneficiaryPlayerId:7,attemptId,agreed:true,acceptedTotal:525});
  assert.equal(r.status,200);
  const saved=app.writes.find(w=>w.table==='native_license_checkouts').value;
  assert.equal(saved.player_id,7);assert.equal(saved.user_id,user.id);
  assert.equal(JSON.parse(app.calls[0].config.body).email,user.email);
});
test('a saved checkout can be verified even if the payer has no player profile',async()=>{
  const app=server({noPayer:true});const r=await app.call({action:'verify',reference});
  assert.equal(r.body.paid,true);assert.equal(app.writes[0].table,'payments');
});
test('playing preferences are optional when quoting a completed profile',async()=>{
  const app=server();const r=await app.call({action:'quote',licenseYear:2027});
  assert.equal(r.status,200);assert.equal(r.body.code,undefined);
});
