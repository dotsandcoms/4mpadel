import { test } from 'node:test';
import assert from 'node:assert/strict';
import { removeEventEntries, invokeEventRefund } from '../../src/utils/removeEventEntries.js';
const entries = [{ id: 1, full_name: 'One', division: 'Open' }, { id: 2, full_name: 'Two', division: 'Open' }];
for (const [mode, flags] of [['no_refund', { no_refund: true }], ['refund', {}], ['cash_refund', { skip_paystack: true }]]) {
  test(`removal ${mode} preserves existing service flags for each player`, async () => {
    const calls = []; let audit;
    await removeEventEntries({ event: { id: 3 }, entries, mode, invoke: async body => { calls.push(body); return {}; }, logEventActivity: async row => { audit = row; } });
    assert.deepEqual(calls, entries.map(row => ({ action: 'admin_remove', registration_id: row.id, ...flags })));
    assert.deepEqual(audit.details.registration_ids, [1, 2]);
  });
}
test('invalid mode fails before any service call', async () => {
  await assert.rejects(removeEventEntries({ entries, mode: '', invoke: () => assert.fail('No invocation expected') }), /valid removal option/);
});
test('failed first removal does not submit another player or claim success', async () => {
  let calls = 0;
  await assert.rejects(removeEventEntries({ entries, mode: 'refund', invoke: async () => { calls++; throw new Error('Unavailable'); }, logEventActivity: () => assert.fail('No success audit') }), /Unavailable/);
  assert.equal(calls, 1);
});
test('refund service error is surfaced', async () => {
  await assert.rejects(invokeEventRefund({ functions: { invoke: async () => ({ data: { error: 'Not permitted' } }) } }, {}), /Not permitted/);
});
test('successful service response still surfaces refund attention statuses', async () => {
  const result = await removeEventEntries({ event: { id: 3 }, entries: [entries[0]], mode: 'refund', invoke: async () => ({ processed: true, refunds: [{ status: 'needs_attention' }] }), logEventActivity: async () => {} });
  assert.match(result.warnings[0], /One: refund needs review/);
});
