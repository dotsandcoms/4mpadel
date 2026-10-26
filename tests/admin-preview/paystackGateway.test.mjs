import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler, hasPlatformAccess } from '../../supabase/functions/paystack-preview-transactions/handler.js';

const transaction = { reference: 'test-reference', amount: 65000, currency: 'ZAR', status: 'ongoing', domain: 'test', metadata: { private: true }, customer: { email: 'private@example.com' } };
const payload = () => ({ status: true, data: [transaction], meta: { page: 6, perPage: 50, total: 400, pageCount: 8 } });
function fixture(overrides = {}) {
  const calls = [];
  const handler = createHandler({ authenticate: async () => ({ id: 'verified', email: 'admin@example.com' }),
    authorize: async () => true, getSecret: mode => `sk_${mode}_synthetic`,
    fetchGateway: async (url, options) => { calls.push({ url, options }); return Response.json(payload()); }, ...overrides });
  const request = (query = 'mode=test&page=6', options = {}) => handler(new Request(`https://local.test/?${query}`, {
    headers: { authorization: 'Bearer synthetic' }, ...options,
  }));
  return { request, calls };
}

test('gateway reads page six without a 500-record cap, preserves status and minor units, strips PII', async () => {
  const { request, calls } = fixture();
  const response = await request();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.pagination.hasMore, true);
  assert.equal(body.pagination.total, 400);
  assert.equal(body.transactions[0].amountMinor, 65000);
  assert.equal(body.transactions[0].status, 'ongoing');
  assert.equal(body.transactions[0].metadata, undefined);
  assert.equal(body.transactions[0].customer, undefined);
  assert.equal(calls[0].options.method, 'GET');
  assert.match(calls[0].url, /page=6/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('unauthenticated, delegated and mutation requests cannot contact gateway', async () => {
  for (const [overrides, options, expected] of [
    [{}, { headers: {} }, 401], [{ authenticate: async () => null }, {}, 401],
    [{ authorize: async () => false }, {}, 403], [{}, { method: 'POST' }, 405],
    [{ authorize: async () => { throw Error('private database error'); } }, {}, 503],
  ]) {
    const { request, calls } = fixture(overrides);
    assert.equal((await request(undefined, options)).status, expected);
    assert.equal(calls.length, 0);
  }
});

test('rejects mixed environments, invalid dates and pagination before gateway call', async () => {
  for (const query of ['mode=both', 'mode=test&page=0', 'mode=test&perPage=101',
    'mode=test&from=2026-02-30T00:00:00.000Z', 'mode=test&status=pending',
    'mode=test&from=2026-09-08T00:00:00.000Z&to=2026-09-07T00:00:00.000Z']) {
    const { request, calls } = fixture();
    assert.equal((await request(query)).status, 400);
    assert.equal(calls.length, 0);
  }
  const { request, calls } = fixture({ getSecret: () => 'sk_live_wrong_environment' });
  assert.equal((await request()).status, 503);
  assert.equal(calls.length, 0);
});

test('gateway failures are sanitized and malformed money/environment fail closed', async () => {
  for (const value of [{ ...payload(), data: [{ ...transaction, domain: 'live' }] },
    { ...payload(), data: [{ ...transaction, amount: Number.MAX_SAFE_INTEGER + 1 }] },
    { ...payload(), meta: null }]) {
    const { request } = fixture({ fetchGateway: async () => Response.json(value) });
    assert.equal((await request()).status, 502);
  }
  const { request } = fixture({ fetchGateway: async () => Response.json({ message: 'sk_secret_private' }, { status: 500 }) });
  assert.doesNotMatch(await (await request()).text(), /sk_secret_private/);
});

test('slow requests time out', async () => {
  const { request } = fixture({ timeoutMs: 5, fetchGateway: async (_, { signal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(Error('aborted')), { once: true });
  }) });
  assert.equal((await request()).status, 504);
});

test('role lookup escapes wildcard emails and requires exact super_admin role', async () => {
  for (const role of ['super_admin', 'admin', 'custom', null]) {
    const calls = [];
    const query = { select() { return this; }, ilike(...args) { calls.push(args); return this; },
      async maybeSingle() { return { data: { role }, error: null }; } };
    assert.equal(await hasPlatformAccess({ from: () => query }, 'A_%@example.com'), role === 'super_admin');
    assert.deepEqual(calls, [['email', 'a\\_\\%@example.com']]);
  }
});
