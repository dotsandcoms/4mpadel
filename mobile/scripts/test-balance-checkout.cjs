const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const helper = {}; vm.runInNewContext(ts.transpileModule(fs.readFileSync('supabase/functions/native-entry-balance/balance.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: helper });
const source = ts.transpileModule(fs.readFileSync('supabase/functions/native-entry-balance/index.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const ref = 'MBAL-' + 'a'.repeat(48);
function server(options = {}) {
  let handler;
  const calls = [], writes = [];
  const reg = { id: 'r1', event_id: 1, email: 'me@example.com', division_id: 'd1', division: 'Open', payment_status: 'paid', status: 'registered', updated_at: '2026-01-01', ...options.reg };
  const tables = {
    event_registrations: [reg], calendar: [{ id: 1, event_name: 'Test', is_manual: true, start_date: '2099-01-01', ...options.event }],
    tournament_divisions: [{ id: 'd1', event_id: 1, name: 'Open', entry_fee: options.baseFee || 1.5 }, { id: 'd2', event_id: 1, name: 'Advanced', entry_fee: 500, is_active: true, ...options.target }],
    players: [{ id: 1, email: 'me@example.com' }], payments: [...(options.noOriginal ? [] : [{id: 'original',event_id:1,reference:'original',amount:1,status:'success',metadata:{source:'manual_event',covers:[{type:'entry',email:'me@example.com',division:'Open'}],division_entry_fees:{Open:1}}}]), ...(options.payment ? [options.payment] : [])],
  };
  const client = {
    auth: { getUser: async () => ({ data: { user: options.noUser ? null : { id: 'u1', email: 'me@example.com' } } }) },
    from(table) {
      let filters = [], op, payload, single = false;
      const q = {
        select() { return q; }, eq(k, v) { filters.push(r => k === 'metadata' ? JSON.stringify(r.metadata) === v : k === 'metadata->>native_switch_lock' ? r.metadata?.native_switch_lock === v : r[k] === v); return q; }, neq(k, v) { filters.push(r => r[k] !== v); return q; },
        ilike(k, v) { filters.push(r => String(r[k]).toLowerCase() === v.toLowerCase()); return q; },
        contains(k, v) { filters.push(r => Object.entries(v).every(([key, value]) => r[k]?.[key] === value)); return q; },
        order() { return q; }, limit() { return q; }, maybeSingle() { single = true; return q; },
        insert(v) { op = 'insert'; payload = v; return q; }, update(v) { op = 'update'; payload = v; return q; },
        then(resolve, reject) {
          let rows = (tables[table] || []).filter(r => filters.every(f => f(r)));
          if (op) { writes.push({ table, op, payload }); if (op === 'insert') { const row = { id: 'p1', ...payload }; tables[table].push(row); rows = [row]; } else rows.forEach(r => Object.assign(r, payload)); }
          return Promise.resolve({ data: single ? rows[0] || null : rows, error: null }).then(resolve, reject);
        },
      }; return q;
    },
  };
  vm.runInNewContext(source, { exports: {}, require: name => name === './balance.ts' ? helper : ({ createClient: () => client }), Request, Response, URL, TextEncoder, AbortSignal, crypto: webcrypto, console,
    Deno: { env: { get: n => n === 'PAYSTACK_SECRET_KEY' ? 'sk_live_mock' : 'https://example.test' }, serve: f => handler = f },
    fetch: async (url, init) => {
      calls.push({ url, body: init.body ? JSON.parse(init.body) : null });
      if (url.endsWith('/initialize')) return Response.json({ status: true, data: { authorization_url: 'https://checkout.paystack.com/mock' } });
      if (url.includes('/verify/')) return Response.json({ status: true, data: { reference: options.payment?.reference || ref, currency: 'ZAR', amount: 50, metadata: {user_id:'u1',registration_id:'r1'}, status: 'success', customer: { email: 'me@example.com' }, domain: 'live', ...options.verification } });
      if (url.endsWith('/paystack-refund')) { if (options.moveFailure) return Response.json({ error: 'Registration closed' }, { status: 400 }); reg.division_id = 'd2'; reg.division = 'Advanced'; return Response.json({ switched: true }); }
      throw new Error('Unexpected external call');
    },
  });
  return { calls, writes, tables, get: url => handler(new Request(url)), async call(input = {}) { const r = await handler(new Request('https://example.test/native-division-switch', { method: 'POST', body: JSON.stringify({ action: 'quote', registrationId: 'r1', targetDivisionId: 'd2', ...input }) })); return { status: r.status, body: await r.json() }; } };
}

function payment() { return { id: 'p1', event_id: 1, reference: ref, amount: .5, status: 'processing', metadata: { source:'native_entry_balance', user_id:'u1', registration_id:'r1', division:'Open', quote:{total:.5}, authorization_url:'https://checkout.paystack.com/saved' } }; }
test('balance quote uses recorded credit and refuses tampered checkout price',async()=>{const app=server();assert.equal((await app.call()).body.quote.total,.5);assert.equal((await app.call({action:'checkout',acceptedTotal:.01})).status,400);assert.equal(app.calls.length,0);});
test('balance checkout resumes the same rand payment and fixed app return',async()=>{const app=server({baseFee:2});const first=await app.call({action:'checkout',acceptedTotal:1});assert.equal(first.status,200);assert.equal(app.calls[0].body.amount,100);assert.match(app.calls[0].body.callback_url,/native-entry-balance\/return$/);assert.equal((await app.call({action:'checkout',acceptedTotal:1})).body.reference,first.body.reference);assert.equal(app.calls.length,1);});
test('a new checkout does not reuse an abandoned payment reference',async()=>{const old={...payment(),status:'abandoned',amount:1};const app=server({baseFee:2,payment:old});const result=await app.call({action:'checkout',acceptedTotal:1});assert.equal(result.status,200);assert.match(result.body.reference,/^MBAL-[a-f0-9]{48}$/);assert.notEqual(result.body.reference,old.reference);assert.equal(app.calls[0].body.reference,result.body.reference);});
test('payment must belong to the account and entry and be verified before credit is recorded',async()=>{for(const opts of [{noUser:true},{reg:{email:'other@example.com'}},{verification:{amount:1}},{verification:{currency:'USD'}},{verification:{customer:{email:'other@example.com'}}},{verification:{metadata:{user_id:'other',registration_id:'r1'}}}]){const app=server({payment:payment(),...opts});assert.ok((await app.call({action:'confirm',reference:ref})).status>=400);assert.equal(app.writes.length,0);}});
test('pending payment never clears balance, verified retry credits it once',async()=>{const pending=server({payment:payment(),verification:{status:'abandoned'}});assert.equal((await pending.call({action:'confirm',reference:ref})).body.pending,true);assert.equal(pending.writes.length,0);const app=server({payment:payment()});for(let i=0;i<2;i++){const result=await app.call({action:'confirm',reference:ref});assert.equal(result.body.paid,true);assert.equal(result.body.balance.due,0);}assert.equal(app.tables.event_registrations[0].division_id,'d1');});
test('unitemised historical paid entry cannot be charged again',async()=>{const app=server({noOriginal:true});assert.equal((await app.call({action:'checkout',acceptedTotal:1.5})).status,400);assert.equal(app.calls.length,0);});
test('return only navigates to fixed native balance screen',async()=>{const app=server();const result=await app.get('https://example.test/native-entry-balance/return?reference='+ref+'&redirect=https://evil.test');assert.equal(result.status,302);assert.equal(result.headers.get('location'),'fourmpadel://events/pay-balance?reference='+ref);assert.equal(app.writes.length,0);});

test('sub-rand debt stays visible but cannot create an unsupported charge',async()=>{const app=server();assert.equal((await app.call()).body.quote.due,.5);const result=await app.call({action:'checkout',acceptedTotal:.5});assert.match(result.body.error,/R1.00 minimum/);assert.equal(app.calls.length,0);assert.equal(app.writes.length,0);});
