import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { transform } from 'esbuild';

const { code } = await transform(await fs.readFile('supabase/functions/event-cash-receipts/index.ts', 'utf8'), { loader: 'ts', format: 'cjs' });
function fixture({ rows = [], user = { id: 'manager' }, allowed = true, legacyService = false, secret = 'gateway-secret', verify, gateway } = {}) {
  const reads = [], calls = [];
  const createClient = (_url, key) => ({
    auth: { getUser: async () => ({ data: { user }, error: null }), admin: { listUsers: async () => ({ error: legacyService ? null : new Error('Invalid service key') }) } },
    rpc: async (name, args) => { reads.push({ name, args, key }); return { data: allowed }; },
    from: table => ({ select: fields => ({ order() { return this; }, eq: async (field, value) => { reads.push({ table, fields, field, value, key }); return { data: table === 'payments' ? rows : [] }; } }) }),
  });
  const mod = { exports: {} };
  vm.runInNewContext(code, { module: mod, exports: mod.exports, require: () => ({ createClient }), Request, Response, AbortSignal, URLSearchParams, URL, atob,
    Deno: { serve() {}, env: { get: name => ({ SUPABASE_URL: 'https://database.example', SUPABASE_SERVICE_ROLE_KEY: 'service-key', SUPABASE_ANON_KEY: 'anon-key', PAYSTACK_SECRET_KEY: secret })[name] } },
    fetch: async (url, options) => {
      calls.push({ url, options });
      if (gateway) return new Response(JSON.stringify(gateway(url)));
      if (url.includes('/refund?')) return new Response(JSON.stringify({ status: true, data: [{ id: 'refund-1', transaction: new URL(url).searchParams.get('transaction'), domain: 'live', currency: 'ZAR', amount: 60000, status: 'processed' }] }));
      const reference = url.split('/').at(-1);
      return new Response(JSON.stringify(verify ? verify(reference) : { status: true, data: { id: reference, reference, amount: 60000, domain: 'live', status: 'success', currency: 'ZAR', customer: { email: 'payer@example.com' } } }));
    },
  });
  return { reads, calls, request: async (body = { event_id: 479 }, token = 'manager-token') => {
    const response = await mod.exports.handleEventCashReceipts(new Request('https://function.example', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: JSON.stringify(body) }));
    return { status: response.status, body: await response.json() };
  } };
}
const row = (metadata, rest = {}) => ({ payment_type: 'event_entry_fee', status: 'success', metadata, ...rest });
test('authentication, event validation and event finance permission are required before reading payments', async () => {
  const f = fixture({ allowed: false });
  assert.equal((await f.request({}, null)).status, 401);
  assert.equal((await f.request({ event_id: -1 })).status, 400);
  assert.equal((await f.request()).status, 403);
  assert.equal(f.reads.some(r => r.table), false);
  const unauthenticated = fixture({ user: null });
  assert.equal((await unauthenticated.request()).status, 401);
  assert.equal(unauthenticated.reads.length, 0);
});
test('verifies unique references only from successful non-test entry payments for the authorized event', async () => {
  const f = fixture({ rows: [row({ note: 'Paid T396848386071945' }), row({ payment_note: 'T396848386071945' }),
    row({ source: 'manual_event_admin' }, { reference: 'T810914772321915' }),
    row({ note: 'T111111111111111' }, { payment_type: 'membership' }), row({ note: 'T222222222222222' }, { is_test: true }),
    row({ note: 'T333333333333333' }, { status: 'failed' }), row({ note: 'T444444444444444', is_test: true })] });
  const result = await f.request();
  assert.equal(result.status, 200);
  assert.equal(result.body.receipts.length, 2);
  assert.equal(f.calls.length, 2);
  assert.equal(f.reads.find(r => r.table).field, 'event_id');
  assert.equal(f.reads.find(r => r.table).value, 479);
  assert.ok(f.calls.every(c => c.url.startsWith('https://api.paystack.co/transaction/verify/T')));
  assert.ok(f.calls.every(c => c.options.headers.Authorization === 'Bearer gateway-secret'));
  assert.equal(result.body.receipts[0].amount, 600);
  assert.equal(JSON.stringify(result.body).includes('gateway-secret'), false);
});
test('failed, test, non-ZAR and mismatched receipts are unresolved rather than credited', async () => {
  for (const patch of [ { domain: 'test' }, { currency: 'USD' }, { reference: 'wrong' }, { amount: 0 }, { id: null }]) {
    const f = fixture({ rows: [row({ note: 'T396848386071945' })], verify: reference => ({ status: true, data: { id: 1, reference, amount: 60000, currency: 'ZAR', domain: 'live', status: 'success', ...patch } }) });
    const result = await f.request();
    assert.equal(result.body.receipts.length, 0);
    assert.equal(result.body.unresolved.length, 1);
  }
});
test('missing provider credentials do not return an unverified receipt', async () => {
  const f = fixture({ secret: '', rows: [row({ note: 'T396848386071945' })] });
  assert.equal((await f.request()).status, 503);
  assert.equal(f.calls.length, 0);
});
test('read-only internal service invocation remains scoped to an event', async () => {
  const f = fixture({ rows: [] });
  const result = await f.request({ event_id: 479 }, 'service-key');
  assert.equal(result.status, 200);
  assert.equal(result.body.receipts.length, 0);
  assert.equal(f.reads.length, 2);
  assert.equal(f.reads[0].value, 479);
});
test('legacy service JWTs must pass a real Auth admin API check', async () => {
  const token = `header.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.signature`;
  const forged = fixture({ user: null });
  assert.equal((await forged.request({ event_id: 479 }, token)).status, 401);
  assert.equal(forged.reads.length, 0);
  const valid = fixture({ user: null, legacyService: true });
  assert.equal((await valid.request({ event_id: 479 }, token)).status, 200);
  assert.equal(valid.reads[0].value, 479);
});
test('missing-reference discovery is internal-only and never credits unrelated event payments', async () => {
  const manual = row({ email: 'payer@example.com', registration_id: 'entry', source: 'manual_event_admin', note: 'paid via Paystack link' },
    { reference: 'MANUAL-ADMIN-entry', amount: 600, payment_method: 'paystack', created_at: '2026-10-13T06:48:32Z' });
  const gateway = url => url.includes('/customer/') ? { status: true, data: { id: 12 } } : { status: true, data: [
    { id: 1, reference: 'T139586391206928', amount: 60000, currency: 'ZAR', domain: 'live', status: 'success', metadata: {} },
    { id: 2, reference: 'other-event', amount: 60000, currency: 'ZAR', domain: 'live', status: 'success', metadata: { event_id: 470 } },
  ] };
  const manager = fixture({ rows: [manual], gateway });
  assert.equal((await manager.request({ event_id: 479, discover_missing: true })).body.candidates.length, 0);
  assert.equal(manager.calls.length, 0);
  const internal = fixture({ rows: [manual], gateway });
  const result = await internal.request({ event_id: 479, discover_missing: true }, 'service-key');
  assert.equal(result.body.receipts.length, 0);
  assert.equal(result.body.candidates.length, 1);
  assert.equal(result.body.candidates[0].reference, 'T139586391206928');
  assert.equal(internal.calls.length, 2);
  assert.ok(internal.calls[1].url.includes('customer=12'));
});
test('full receipt audit is event-authorized, paginated and keeps confirmed reversals separate', async () => {
  const rows = Array.from({ length: 45 }, (_, index) => row({}, { reference: `REGEV-479-${index}`, payment_method: 'paystack' }));
  const f = fixture({ rows, verify: reference => ({ status: true, data: { id: reference, reference, domain: 'live', currency: 'ZAR', status: reference.endsWith('-40') ? 'reversed' : 'success', amount: 60000 } }) });
  const result = await f.request({ event_id: 479, verify_all: true, offset: 40 }, 'service-key');
  assert.equal(result.status, 200);
  assert.equal(result.body.total_references, 45);
  assert.equal(result.body.next_offset, null);
  assert.equal(result.body.receipts.length, 4);
  assert.equal(result.body.reversals.length, 1);
  assert.equal(result.body.unresolved.length, 0);
  assert.equal(f.calls.length, 6);
  const manager = fixture({ rows });
  assert.equal((await manager.request({ event_id: 479, verify_all: true })).body.receipts.length, 40);
  assert.equal(manager.calls.length, 40);
});
test('partial reversal preserves the actual refund amount and only performs GET requests', async () => {
  const f = fixture({ rows: [row({}, { reference: 'REGEV-479-123', payment_method: 'paystack' })], gateway: url => url.includes('/refund?')
    ? { status: true, data: [{ id: 8, transaction: { id: 19 }, domain: 'live', currency: 'ZAR', amount: 60000, status: 'processed' }] }
    : { status: true, data: { id: 19, reference: 'REGEV-479-123', amount: 120000, currency: 'ZAR', domain: 'live', status: 'reversed' } } });
  const result = await f.request({ event_id: 479, verify_all: true, verify_refunds: true }, 'service-key');
  assert.equal(result.body.reversals[0].amount, 1200);
  assert.equal(result.body.gateway_refunds[0].amount, 600);
  assert.equal(result.body.unresolved.length, 0);
  assert.ok(f.calls.every(c => !c.options.method || c.options.method === 'GET'));
});
