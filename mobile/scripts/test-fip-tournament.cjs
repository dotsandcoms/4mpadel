const test = require('node:test'), assert = require('node:assert/strict');
const { parseDocument } = require('htmlparser2');
let parser, gateway;
test.before(async () => { parser = await import('../supabase/functions/_shared/fip-tournament.mjs'); gateway = await import('../supabase/functions/fip-tournament/handler.mjs'); });
const event = { id: -17, name: 'FIP BRONZE TEST', sourceUrl: 'https://www.padelfip.com/events/fip-bronze-test/', startDate: '2026-10-08', endDate: '2026-10-11' };
const pdf = 'https://www.padelfip.com/wp-content/uploads/2026/10/draw.pdf';
const page = `<h1 class="event__name">FIP BRONZE TEST</h1><div class="overview__mirror"><span class="overview__title">Prize Money</span><p class="overview__text">12.000 €</p></div><div class="overview__mirror"><span class="overview__title">General info</span><p class="overview__text">private contact details</p></div><script>var gender='M'</script><a class="bw-button draw" href="${pdf}"><span class="bw-button-text">Boys U12 Draw</span></a><a class="bw-button oop" href="https://www.padelfip.com/wp-content/uploads/2026/10/order.pdf"><span class="bw-button-text">Order of Play Friday</span></a><a class="bw-button draw" href="https://evil.test/draw.pdf">Unsafe document</a><div class="colDraw" data-round="1"><div class="singleMatch" data-match-id="MD001"><div class="singleMatch__team"><div class="singleMatch__team--item"><img class="singleMatch__team--itemFlag" src="https://www.padelfip.com/Brazil_Fip.jpg"><p class="singleMatch__team--itemName">Lucas <span class="ranking">123</span></p></div><div class="additionalInfo"><small>(1)</small><span>&#10003;</span></div><div class="singleMatch__tableSet">6</div><div class="singleMatch__tableSet">6</div></div><div class="singleMatch__team"><div class="singleMatch__team--item"><p class="singleMatch__team--itemName">Brad</p></div><div class="singleMatch__tableSet">0</div><div class="singleMatch__tableSet">1</div></div></div></div>`;
const now = Date.parse('2026-10-08T10:00:00Z');
function mockCache(initial = null) {
  let row = initial, claimed = false;
  return { get row() { return row; }, from() { let update; return { select() { return this; }, update(value) { update = value; return this; }, eq() { if (update) { row = { ...(row || {}), ...update }; return Promise.resolve({ error: null }); } return this; }, maybeSingle: async () => ({ data: row, error: null }) }; }, rpc: async () => { if (claimed) return { data: false }; claimed = true; return { data: true }; } };
}
test('parses only whitelisted facts, age-group draws and daily schedules', () => {
  const value = parser.parseFipTournament(page, event, parseDocument, now);
  assert.deepEqual(value.info, [{ label: 'Prize money', value: '12.000 €' }]);
  assert.equal(value.documents.length, 2); assert.deepEqual(value.documents.map(d => d.kind), ['draw', 'schedule']);
  assert.ok(!JSON.stringify(value).includes('private contact'));
});
test('preserves zero scores, published winners, seeds and flags without inventing profiles or schedule times', () => {
  const draw = parser.parseFipTournament(page, event, parseDocument, now).sections[0];
  assert.equal(draw.name, 'Men · Main draw'); assert.equal(draw.rounds[0].name, 'Final');
  const match = draw.rounds[0].matches[0]; assert.deepEqual(match.scores, [[6, 0], [6, 1]]); assert.equal(match.winner, 1); assert.equal(match.completed, true);
  assert.deepEqual(match.one.players[0], { name: 'Lucas', id: null, photo: null, country: 'BR' }); assert.equal(match.one.seed, '1'); assert.equal(match.start, null);
  const pending = parser.parseFipTournament(page.replace('&#10003;', ''), event, parseDocument, now).sections[0].rounds[0].matches[0]; assert.equal(pending.winner, null); assert.equal(pending.completed, false);
});
test('rejects wrong pages, markup changes and non-official URLs', () => {
  assert.throws(() => parser.parseFipTournament(page.replace('event__name', 'changed'), event, parseDocument, now));
  assert.throws(() => parser.parseFipTournament(page, { ...event, name: 'Other event' }, parseDocument, now));
  for (const url of ['https://evil.test/draw.pdf', 'https://www.padelfip.com.evil.test/wp-content/uploads/draw.pdf', 'http://www.padelfip.com/wp-content/uploads/draw.pdf', 'https://u:p@www.padelfip.com/wp-content/uploads/draw.pdf', `${pdf}?redirect=1`]) assert.equal(parser.officialDocumentUrl(url), null);
});
test('refresh cadence follows current dates instead of stale calendar status', () => {
  assert.equal(parser.fipRefreshSeconds(event, now), 900);
  assert.equal(parser.fipRefreshSeconds(event, Date.parse('2026-10-07')), 21600);
  assert.equal(parser.fipRefreshSeconds(event, Date.parse('2026-10-12')), 604800);
});
test('2,000 concurrent readers cause one upstream request; subsequent users read the shared cache', async () => {
  const client = mockCache(); let calls = 0;
  const fetchImpl = async () => { calls++; await new Promise(r => setTimeout(r, 5)); return new Response(page); };
  const values = await Promise.all(Array.from({ length: 2000 }, () => gateway.sharedFipTournament(client, event, parseDocument, fetchImpl, now)));
  assert.equal(calls, 1); assert.equal(values.filter(v => !v.pending).length, 1);
  assert.equal((await gateway.sharedFipTournament(client, event, parseDocument, fetchImpl, now)).pending, false); assert.equal(calls, 1);
});
test('upstream failures and transient lost draw markup retain the last successful payload and timestamp', async () => {
  const payload = parser.parseFipTournament(page, event, parseDocument, now);
  for (const response of [new Response('unavailable', { status: 429 }), new Response('<h1 class="event__name">FIP BRONZE TEST</h1><div class="overview__mirror"><span class="overview__title">Gender</span><p class="overview__text">Male</p></div>')]) {
    const client = mockCache({ payload, refresh_after: '2026-10-01' });
    const value = await gateway.sharedFipTournament(client, event, parseDocument, async () => response, now + 900000);
    assert.equal(value.stale, true); assert.equal(value.updatedAt, payload.updatedAt); assert.equal(value.documents.length, 2); assert.ok(client.row.lease_until);
  }
});
test('no-cache failures are pending, never falsely described as unpublished draws', async () => {
  const value = await gateway.sharedFipTournament(mockCache(), event, parseDocument, async () => new Response('blocked', { status: 403 }), now);
  assert.equal(value.pending, true); assert.equal(value.updatedAt, null);
});
test('gateway authenticates and resolves IDs from the shared calendar, ignoring supplied URLs', async () => {
  let calls = 0, lookups = 0;
  const deps = { client: mockCache(), parseDocument, authenticate: async () => true, resolveEvent: async id => { lookups++; return id === -17 ? event : null; }, now, fetchImpl: async url => { calls++; assert.equal(url, event.sourceUrl); return new Response(page); } };
  const req = body => new Request('https://app.test', { method: 'POST', body: JSON.stringify(body) });
  assert.equal((await gateway.handleFipTournament(req({ eventId: -17 }), { ...deps, authenticate: async () => false })).status, 401); assert.equal(lookups, 0);
  assert.equal((await gateway.handleFipTournament(req({ eventId: 17 }), deps)).status, 400);
  assert.equal((await gateway.handleFipTournament(req({ eventId: -99 }), deps)).status, 404); assert.equal(calls, 0);
  const response = await gateway.handleFipTournament(req({ eventId: -17, sourceUrl: 'https://evil.test' }), deps); assert.equal(response.status, 200); assert.equal(calls, 1);
});
