import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cancelEventScope } from '../../src/pages/admin-preview/eventCancellation.js';
import { belongsToDivision, cancellationRefundStatus } from '../../supabase/functions/paystack-refund/division-cancellation.js';

function fixture({ role = 'super_admin', failure = false, imported = false, cancelled = false } = {}) {
  const calls = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { email: 'admin@example.test' } } }) },
    from(table) {
      let write = false, offset = 0;
      const rows = [{ id: 1, division_id: 4, status: 'registered' }, { id: 2, division: 'Open', status: 'registered' }, { id: 3, division_id: 5, status: 'registered' }, { id: 4, division_id: 4, status: 'withdrawn' }];
      const query = { select() { return query; }, eq() { return query; }, order() { return query; }, range(start) { offset = start; return query; }, update(patch) { write = true; calls.push(patch); return query; }, single() { return query; }, maybeSingle() { return query; }, then(resolve) { return Promise.resolve({ data: table === 'admin_sidebar_permissions' ? { role } : table === 'calendar' ? { id: 7, is_manual: !imported } : table === 'tournament_divisions' ? (write ? { id: 4 } : { id: 4, name: 'Open', cancelled_at: cancelled ? '2026-09-22T10:00:00Z' : null }) : rows.slice(offset, offset + 500), error: null }).then(resolve); } };
      return query;
    },
    functions: { invoke: async (_name, { body }) => { calls.push(body); return failure ? { error: { message: 'Connection lost' } } : { data: { processed: true, cancelled: true, division_id: body.division_id, registrations_processed: 2, refund_status: 'processing', refunds: [{ status: 'processing' }] } }; } },
  };
  return { client, calls };
}
test('event cancellation invokes the existing cancellation workflow with reason', async () => {
  const { client, calls } = fixture();
  const result = await cancelEventScope({ client, event: { id: 7 }, reason: ' Rain ' });
  assert.deepEqual(calls, [{ action: 'cancel_event', event_id: 7, cancellation_reason: 'Rain' }]);
  assert.equal(result.refund_status, 'processing');
});
test('division cancellation uses the current live dedicated server action and reason, without client writes', async () => {
  const { client, calls } = fixture();
  const result = await cancelEventScope({ client, event: { id: 7 }, divisionId: 4, reason: ' Rain ' });
  assert.deepEqual(calls, [{ action: 'cancel_division', event_id: 7, division_id: 4, cancellation_reason: 'Rain' }]);
  assert.equal(result.registrations_processed, 2);
  assert.equal(result.refund_status, 'processing');
});
test('division failure never falls back to individual removals or retries', async () => {
  const { client, calls } = fixture({ failure: true });
  await assert.rejects(cancelEventScope({ client, event: { id: 7 }, divisionId: 4 }), /Connection lost/);
  assert.equal(calls.length, 1);
});
test('unauthorised and imported events cannot invoke cancellation', async () => {
  for (const options of [{ role: 'club_admin' }, { imported: true }]) {
    const { client, calls } = fixture(options);
    await assert.rejects(cancelEventScope({ client, event: { id: 7 } }));
    assert.deepEqual(calls, []);
  }
});
test('ambiguous cancellation response is not reported as success', async () => {
  const { client } = fixture();
  client.functions.invoke = async () => ({ data: {} });
  await assert.rejects(cancelEventScope({ client, event: { id: 7 } }), /Cancellation was not confirmed/);
});
test('wrong division response is not reported as success', async () => {
  const { client } = fixture();
  client.functions.invoke = async () => ({ data: { processed: true, cancelled: true, division_id: 99 } });
  await assert.rejects(cancelEventScope({ client, event: { id: 7 }, divisionId: 4 }), /not confirmed/);
});
test('already cancelled divisions cannot trigger another refund request', async () => {
  const { client, calls } = fixture({ cancelled: true });
  await assert.rejects(cancelEventScope({ client, event: { id: 7 }, divisionId: 4 }), /already cancelled/);
  assert.deepEqual(calls, []);
});
test('live division matcher prioritises IDs and only falls back to names for legacy entries', () => {
  const division = { id: 4, name: 'Open' };
  assert.equal(belongsToDivision({ division_id: '4' }, division), true);
  assert.equal(belongsToDivision({ division_id: 5, division: 'Open' }, division), false);
  assert.equal(belongsToDivision({ division: 'Open' }, division), true);
  assert.equal(belongsToDivision({ division: 'Mixed' }, division), false);
});
test('live refund status keeps manual-review warnings ahead of processing or completion', () => {
  assert.equal(cancellationRefundStatus([]), 'complete');
  assert.equal(cancellationRefundStatus([{ status: 'processing' }]), 'processing');
  assert.equal(cancellationRefundStatus([{ status: 'processing' }, { status: 'skipped:manual' }]), 'needs_attention');
  assert.equal(cancellationRefundStatus([{ status: 'needs_attention' }]), 'needs_attention');
});
