const test = require('node:test'), assert = require('node:assert/strict');
let handler;
test.before(async () => { handler = await import('../supabase/functions/tournament-draws/handler.mjs'); });
function clientFor(cache = null, event = { rankedin_id: '75153', is_visible: true, sanction_status: 'approved' }) {
  let claimed = false, calls = 0, writes = 0;
  const client = { from(table) { const q = { select() { return q; }, eq() { return q; }, maybeSingle() { return Promise.resolve({ data: table === 'calendar' ? event : cache }); }, upsert(row) { writes++; cache = { payload: row.payload, updated_at: row.updated_at }; return Promise.resolve({}); } }; return q; },
    async rpc() { calls++; if (claimed) return { data: false }; claimed = true; return { data: true }; } };
  return { client, counts: () => ({ claims: calls, writes }) };
}
const request = body => new Request('https://server.test/draws', { method: 'POST', body: JSON.stringify(body) });
test('unauthenticated calls and invalid events never reach the database or provider', async () => {
  const client = { from: () => assert.fail('database reached') };
  assert.equal((await handler.handleDraws(request({ eventId: 1 }), { client, authenticate: async () => false })).status, 401);
  assert.equal((await handler.handleDraws(request({ eventId: -1 }), { client, authenticate: async () => true })).status, 400);
});
test('hidden events and unpublished divisions never reach the provider', async () => {
  const hidden = clientFor(null, { rankedin_id: '75153', is_visible: false });
  assert.equal((await handler.handleDraws(request({ eventId: 1 }), { client: hidden.client, authenticate: async () => true, fetchImpl: () => assert.fail() })).status, 404);
  const published = clientFor({ payload: [{ Id: 177841, IsPublished: true, TournamentDraws: [{ Stage: 0, Strength: 0 }] }], updated_at: new Date().toISOString() });
  assert.equal((await handler.handleDraws(request({ eventId: 1, classId: 999, stage: 0, strength: 0 }), { client: published.client, authenticate: async () => true, fetchImpl: () => assert.fail() })).status, 404);
});
test('fresh canonical snapshots cause zero provider requests', async () => {
  const stub = clientFor({ payload: [1], updated_at: new Date().toISOString() });
  const data = await handler.sharedDrawCache(stub.client, handler.classesUrl(75153), () => assert.fail());
  assert.equal(data.stale, false); assert.equal(stub.counts().claims, 0);
});
test('2,000 simultaneous draw opens produce one shared provider refresh', async () => {
  const stub = clientFor({ payload: ['old'], updated_at: '2026-10-01T00:00:00Z' }); let provider = 0;
  const snapshots = await Promise.all(Array.from({ length: 2000 }, () => handler.sharedDrawCache(stub.client, handler.drawUrl(177841, 0, 0), async () => { provider++; return Response.json(['new']); })));
  assert.equal(provider, 1); assert.equal(stub.counts().writes, 1); assert.equal(snapshots.length, 2000);
});
test('provider errors and transient empty responses keep the last populated draw', async () => {
  for (const fetchImpl of [async () => { throw new Error('offline'); }, async () => Response.json([])]) {
    const stub = clientFor({ payload: ['published'], updated_at: '2026-10-01T00:00:00Z' });
    const result = await handler.sharedDrawCache(stub.client, handler.classesUrl(75153), fetchImpl);
    assert.deepEqual(result.payload, ['published']); assert.equal(result.stale, true); assert.equal(stub.counts().writes, 0);
  }
});
test('a valid published division uses only its canonical read-only draw URL', async () => {
  const writes = [];
  const client = { from(table) { let url; const q = { select() { return q; }, eq(k, v) { if(k === 'url') url=v; return q; }, maybeSingle() { return Promise.resolve({ data: table === 'calendar' ? { rankedin_id: '75153', is_visible: true } : url === handler.classesUrl(75153) ? { payload: [{ Id: 177841, IsPublished: true, TournamentDraws: [{ Stage: 0, Strength: 0 }] }], updated_at: new Date().toISOString() } : null }); }, upsert(data) { writes.push(data); return Promise.resolve({}); } }; return q; }, rpc: async () => ({ data: true }) };
  const response = await handler.handleDraws(request({ eventId: 470, classId: '177841', stage: 0, strength: 0, url: 'https://evil.test/' }), { client, authenticate: async () => true, fetchImpl: async url => { assert.equal(url, handler.drawUrl(177841, 0, 0)); return Response.json([{ BaseType: 'Elimination' }]); } });
  assert.equal(response.status, 200); assert.equal((await response.json()).payload[0].BaseType, 'Elimination'); assert.equal(writes.length, 1);
});
