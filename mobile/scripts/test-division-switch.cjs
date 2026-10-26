const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const balanceExports = {}; vm.runInNewContext(ts.transpileModule(fs.readFileSync('supabase/functions/native-entry-balance/balance.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: balanceExports });
const source = ts.transpileModule(fs.readFileSync('supabase/functions/native-division-switch/index.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const ref = 'MSWITCH-' + 'a'.repeat(48);
function server(options = {}) {
  let handler;
  const calls = [], writes = [];
  const reg = { id: 'r1', event_id: 1, email: 'me@example.com', division_id: 'd1', division: 'Open', payment_status: 'paid', status: 'registered', updated_at: '2026-01-01', ...options.reg };
  const tables = {
    event_registrations: [reg], calendar: [{ id: 1, event_name: 'Test', is_manual: true, start_date: '2099-01-01', ...options.event }],
    tournament_divisions: [{ id: 'd1', event_id: 1, name: 'Open', entry_fee: 350 }, { id: 'd2', event_id: 1, name: 'Advanced', entry_fee: 500, is_active: true, ...options.target }],
    players: [{ id: 1, email: 'me@example.com' }], payments: options.payment ? [options.payment] : [],
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
  vm.runInNewContext(source, { exports: {}, require: name => name.endsWith('/balance.ts') ? balanceExports : ({ createClient: () => client }), Request, Response, URL, TextEncoder, crypto: webcrypto, console,
    Deno: { env: { get: n => n === 'PAYSTACK_SECRET_KEY' ? 'sk_live_mock' : 'https://example.test' }, serve: f => handler = f },
    fetch: async (url, init) => {
      calls.push({ url, body: init.body ? JSON.parse(init.body) : null });
      if (url.endsWith('/initialize')) return Response.json({ status: true, data: { authorization_url: 'https://checkout.paystack.com/mock' } });
      if (url.includes('/verify/')) return Response.json({ status: true, data: { reference: options.payment?.reference || ref, currency: 'ZAR', amount: 15000, status: 'success', customer: { email: 'me@example.com' }, domain: 'live', ...options.verification } });
      if (url.endsWith('/paystack-refund')) { if (options.moveFailure) return Response.json({ error: 'Registration closed' }, { status: 400 }); reg.division_id = 'd2'; reg.division = 'Advanced'; return Response.json({ switched: true }); }
      throw new Error('Unexpected external call');
    },
  });
  return { calls, writes, tables, get: url => handler(new Request(url)), async call(input = {}) { const r = await handler(new Request('https://example.test/native-division-switch', { method: 'POST', body: JSON.stringify({ action: 'quote', registrationId: 'r1', targetDivisionId: 'd2', ...input }) })); return { status: r.status, body: await r.json() }; } };
}
function payment(overrides = {}) { return { id: 'p1', reference: ref, event_id: 1, amount: 150, status: 'processing', metadata: { source: 'division_switch', native_switch: true, registrant_email: 'me@example.com', registration_id: 'r1', from_division_id: 'd1', target_division_id: 'd2', quote: { total: 150 }, native_authorization_url: 'https://checkout.paystack.com/saved' }, ...overrides }; }
test('quotes server prices; rejects changed accepted totals before initialization', async () => {
  const app = server();
  assert.equal((await app.call()).body.quote.total, 150);
  assert.equal((await app.call({ action: 'checkout', acceptedTotal: 1 })).status, 400);
  assert.equal(app.calls.length, 0); assert.equal(app.writes.length, 0);
});
test('requires authentication, own active paid entry, and open target', async () => {
  for (const o of [{ noUser: true }, { reg: { email: 'another@example.com' } }, { reg: { status: 'withdrawn' } }, { reg: { payment_status: 'pending' } }, { target: { is_active: false } }, { event: { event_status: 'cancelled' } }, { event: { registration_closes_at: '2000-01-01' } }]) {
    const app = server(o); assert.ok((await app.call({ action: 'checkout', acceptedTotal: 150 })).status >= 400); assert.equal(app.calls.length, 0);
  }
});
test('checkout initializes only the difference, with app return, and resumes the same attempt', async () => {
  const app = server();
  const first = await app.call({ action: 'checkout', acceptedTotal: 150 });
  assert.equal(first.status, 200);
  assert.equal(app.calls[0].body.amount, 15000);
  assert.match(app.calls[0].body.callback_url, /native-division-switch\/return$/);
  assert.equal(app.calls[0].body.metadata.registration_id, 'r1');
  const second = await app.call({ action: 'checkout', acceptedTotal: 150 });
  assert.equal(second.body.reference, first.body.reference);
  assert.equal(app.calls.length, 1);
});
test('unpaid return never moves entry', async () => {
  const app = server({ payment: payment(), verification: { status: 'abandoned' } });
  assert.equal((await app.call({ action: 'confirm', reference: ref })).body.pending, true);
  assert.equal(app.tables.event_registrations[0].division_id, 'd1');
  assert.equal(app.calls.length, 1);
});
test('validates payer, currency, reference, live mode and amount before moving', async () => {
  for (const verification of [{ amount: 1 }, { currency: 'USD' }, { reference: 'other' }, { customer: { email: 'other@example.com' } }, { domain: 'test' }]) {
    const app = server({ payment: payment(), verification });
    assert.equal((await app.call({ action: 'confirm', reference: ref })).status, 400);
    assert.equal(app.calls.filter(c => c.url.endsWith('paystack-refund')).length, 0);
  }
});
test('paid checkout is bound to its account and entry; changing request IDs cannot redirect it', async () => {
  const app = server({ payment: payment() });
  const result = await app.call({ action: 'confirm', reference: ref, registrationId: 'other', targetDivisionId: 'other' });
  assert.equal(result.body.switched, true);
  assert.equal(app.calls.at(-1).body.registration_id, 'r1');
  const wrong = server({ payment: payment({ metadata: { ...payment().metadata, registrant_email: 'other@example.com' } }) });
  assert.equal((await wrong.call({ action: 'confirm', reference: ref })).status, 400);
});
test('confirmation retries do not repeat a completed switch', async () => {
  const app = server({ payment: payment() });
  assert.equal((await app.call({ action: 'confirm', reference: ref })).body.switched, true);
  assert.equal((await app.call({ action: 'confirm', reference: ref })).body.switched, true);
  assert.equal(app.calls.filter(c => c.url.endsWith('paystack-refund')).length, 1);
});
test('changed fees and failed moves preserve paid reference and do not ask for another charge', async () => {
  for (const options of [{ target: { entry_fee: 550 } }, { moveFailure: true }]) {
    const app = server({ payment: payment(), ...options });
    assert.match((await app.call({ action: 'confirm', reference: ref })).body.error, /[Dd]o not pay again/);
    assert.equal(app.calls.filter(c => c.url.endsWith('initialize')).length, 0);
  }
});
test('return route is fixed and does not mutate payment or registration', async () => {
  const app = server();
  const response = await app.get(`https://example.test/native-division-switch/return?reference=${ref}&redirect=https://evil.test`);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), `fourmpadel://events/switch-division?reference=${ref}`);
  assert.equal((await app.get('https://example.test/native-division-switch/return?reference=bad')).status, 400);
  assert.equal(app.calls.length, 0); assert.equal(app.writes.length, 0);
});
