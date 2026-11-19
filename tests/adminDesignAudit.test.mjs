import assert from 'node:assert/strict';
import test from 'node:test';
import { loadAuditPage } from '../src/pages/admin-preview/reviewAuditData.js';

function fixture() {
  const calls = [];
  const client = { from: table => {
    assert.equal(table, 'event_activity_log');
    const query = {
      select: (fields, options) => { calls.push(['select', fields, options]); return query; },
      order: () => query,
      eq: (field, value) => { calls.push(['eq', field, value]); return query; },
      ilike: (field, value) => { calls.push(['ilike', field, value]); return query; },
      range: (from, to) => { calls.push(['range', from, to]); return query; },
      then: resolve => resolve({ data: [{ id: 'audit-fixture' }], count: 72 }),
    };
    return query;
  } };
  return { client, calls };
}

test('tenant audit restricts records to a verified event before reading each page', async () => {
  const { client, calls } = fixture();
  const options = { events: [{ id: 42 }], eventId: '42', category: 'PAYMENT', search: '1_00%', offset: 40 };
  const page = await loadAuditPage(client, options);
  assert.equal(page.count, 72);
  assert.match(calls[0][1], /actor_role$/);
  assert.deepEqual(calls.slice(1), [
    ['eq', 'event_id', '42'], ['eq', 'category', 'PAYMENT'], ['ilike', 'summary', '%1\\_00\\%%'], ['range', 40, 79],
  ]);
  const denied = fixture();
  await assert.rejects(loadAuditPage(denied.client, { ...options, eventId: '91' }), /Choose an event/);
  await assert.rejects(loadAuditPage(denied.client, { ...options, eventId: '' }), /Choose an event/);
  assert.deepEqual(denied.calls, []);
});
