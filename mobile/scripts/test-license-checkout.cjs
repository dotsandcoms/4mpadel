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
  let handler; const writes = [], calls = [];
  let saved = options.saved === null ? null : { reference, user_id: user.id, player_id: 1, amount: 525, ...options.saved };
  const tables = { players: { id: 1, name: 'Test', license_type: options.active ? 'full' : 'none', paid_registration: !!options.active }, commerce_config: { full_license_price: 500, license_fee_percent: 5, full_license_enabled: options.enabled !== false } };
  const client = { auth: { getUser: async () => ({ data: { user: options.signedOut ? null : user } }) }, from: table => {
    const filters = {}; const query = { then: resolve => {
      let data = table === 'native_license_checkouts' ? saved : tables[table];
      if (table === 'native_license_checkouts' && data && Object.entries(filters).some(([k,v]) => data[k] !== v)) data = null;
      return Promise.resolve({ data, error: null }).then(resolve);
    }};
    for (const method of ['select','ilike','maybeSingle','single']) query[method] = () => query;
    query.eq = (key,value) => { filters[key]=value; return query; };
    for (const method of ['upsert','update']) query[method] = value => { writes.push({ table, method, value }); if (table === 'native_license_checkouts') saved = method === 'upsert' ? saved || value : {...saved, ...value}; return query; };
    return query;
  }};
  vm.runInNewContext(code, { exports: {}, require: () => ({ createClient: () => client }), Deno: { env: { get: key => key === 'PAYSTACK_SECRET_KEY' ? 'sk_live_fake' : key === 'SUPABASE_URL' ? 'https://example.supabase.co' : 'fake' }, serve: fn => handler = fn }, Response, Request, URL, AbortSignal,
    fetch: async (url, config) => { calls.push({ url, config }); return Response.json({ status: true, data: url.includes('/verify/') ? { id: 123, reference, status: 'success', domain: 'live', currency: 'ZAR', amount: 52500, customer: { email: user.email }, metadata: { native_user_id: user.id, license_type: 'full' }, ...options.payment } : { authorization_url: 'https://checkout.paystack.com/test' } }); }
  });
  return { writes, calls, call: async body => { const res = await handler(new Request('https://example.test', { method: 'POST', body: JSON.stringify(body) })); return { status: res.status, body: await res.json() }; } };
}
test('anonymous requests cannot read quotes or start payments', async () => { const app=server({signedOut:true}); assert.equal((await app.call({action:'quote'})).status,401); assert.equal(app.writes.length,0); });
test('quote is server priced and never calls the gateway', async () => { const app=server(); const result=await app.call({action:'quote',total:1}); assert.equal(result.body.quote.total,525); assert.equal(app.calls.length,0); });
test('closed sales, active licences, stale totals and missing agreement cannot start payment', async () => { for(const options of [{enabled:false},{active:true},{},{}]) { const app=server(options); const result=await app.call({action:'checkout',attemptId,agreed:options.enabled === false || !!options.active,acceptedTotal:1}); assert.equal(result.status,400); assert.equal(app.calls.length,0); assert.equal(app.writes.length,0); } });
test('checkout initializes only the verified user and server amount', async () => { const app=server({saved:null}); const result=await app.call({action:'checkout',attemptId,agreed:true,acceptedTotal:525,email:'other@example.com'}); assert.equal(result.status,200); const body=JSON.parse(app.calls[0].config.body); assert.equal(body.email,user.email); assert.equal(body.amount,52500); assert.equal(body.metadata.native_user_id,user.id); assert.equal(body.callback_url,'https://example.supabase.co/functions/v1/native-license-checkout/return'); });
test('retry reuses saved payment instead of creating another gateway transaction', async () => { const app=server({saved:{authorization_url:'https://checkout.paystack.com/previous'}}); const result=await app.call({action:'checkout',attemptId,agreed:true,acceptedTotal:525}); assert.equal(result.body.authorizationUrl,'https://checkout.paystack.com/previous'); assert.equal(app.calls.length,0); });
test('verification cannot access another player’s checkout', async () => { const app=server({saved:{user_id:'other'}}); assert.equal((await app.call({action:'verify',reference})).status,400); assert.equal(app.calls.length,0); assert.equal(app.writes.length,0); });
test('failed, underpaid, test-mode, wrong-currency and wrong-owner payments never activate a licence', async () => { for (const payment of [{status:'failed'},{amount:1},{domain:'test'},{currency:'USD'},{customer:{email:'other@example.com'}},{metadata:{native_user_id:'other',license_type:'full'}}]) { const app=server({payment}); const result=await app.call({action:'verify',reference}); assert.notEqual(result.body.paid,true); assert.equal(app.writes.length,0); } });
test('verified payment uses the webhook ledger key and activates the matching player', async () => { const app=server(); assert.equal((await app.call({action:'verify',reference})).body.paid,true); assert.equal(app.writes[0].table,'payments'); assert.equal(app.writes[0].value.reference,'123'); assert.equal(app.writes[0].value.amount,525); assert.equal(app.writes[1].value.license_type,'full'); });
