import test from 'node:test';
import assert from 'node:assert/strict';
import { gatewayDateBounds, loadGatewayPage } from '../../src/pages/admin-preview/paystackGatewayData.js';
const session = { user: { id: 'verified-user' } };
const permissions = { role: 'super_admin' };
const result = { environment: 'test', transactions: [{ reference: 'synthetic', amountMinor: 12000, currency: 'ZAR', status: 'success', environment: 'test' }],
  pagination: { page: 6, perPage: 50, total: 351, pageCount: 8, hasMore: true } };
function fixture({ auth, reply } = {}) {
  const calls = [];
  return { calls, auth: { async getSession() { return auth ?? { data: { session: { ...session, access_token: 'fresh-token' } } }; } },
    functions: { async invoke(...args) { calls.push(args); return reply ?? { data: result }; } } };
}
test('SA date ranges include both selected days with exact UTC boundaries', () => {
  assert.deepEqual(gatewayDateBounds('2026-09-08', '2026-09-08'), { from: '2026-09-07T22:00:00.000Z', to: '2026-09-08T21:59:59.999Z' });
  assert.throws(() => gatewayDateBounds('2026-02-30'));
  assert.throws(() => gatewayDateBounds('2026-09-09', '2026-09-08'));
});
test('gateway uses fresh authenticated GET, selected page and no mixed mode', async () => {
  const client = fixture();
  assert.equal(await loadGatewayPage(client, session, permissions, 'all', { mode: 'test', page: 6 }), result);
  assert.match(client.calls[0][0], /mode=test&page=6&perPage=50/);
  assert.equal(client.calls[0][1].method, 'GET');
  assert.equal(client.calls[0][1].headers.Authorization, 'Bearer fresh-token');
});
test('denied scope, stale user and aborted requests never invoke gateway', async () => {
  const client = fixture();
  await assert.rejects(loadGatewayPage(client, session, permissions, 'club-1', { mode: 'test' }));
  await assert.rejects(loadGatewayPage(client, session, { role: 'custom' }, 'all', { mode: 'test' }));
  await assert.rejects(loadGatewayPage(client, session, permissions, 'all', { mode: 'both' }));
  await assert.rejects(loadGatewayPage(client, session, permissions, 'all', { mode: 'test' }, AbortSignal.abort()));
  assert.equal(client.calls.length, 0);
  const stale = fixture({ auth: { data: { session: { user: { id: 'someone-else' }, access_token: 'wrong' } } } });
  await assert.rejects(loadGatewayPage(stale, session, permissions, 'all', { mode: 'test' }), /session changed/);
  assert.equal(stale.calls.length, 0);
});
test('errors are actionable and wrong environments or malformed amounts cannot render', async () => {
  for (const status of [401,403,404,503,504,500]) {
    const client = fixture({ reply: { error: { context: { status }, message: 'sensitive upstream error' } } });
    await assert.rejects(loadGatewayPage(client, session, permissions, 'all', { mode: 'test', page: 6 }), e => !e.message.includes('sensitive'));
  }
  for (const data of [{ ...result, environment: 'live' }, { ...result, transactions: [{ ...result.transactions[0], amountMinor: NaN }] }]) {
    await assert.rejects(loadGatewayPage(fixture({ reply: { data } }), session, permissions, 'all', { mode: 'test', page: 6 }), /unexpected/);
  }
});
