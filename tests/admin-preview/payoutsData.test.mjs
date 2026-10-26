import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRecordedPayouts, normalizeRecordedPayouts, filterRecordedPayouts } from '../../src/pages/admin-preview/payoutsData.js';
const event = { id: 1, event_name: 'Synthetic Open', organiser_name: 'Synthetic organiser', organiser_interim_payments: [
  { id: 'one', amount: '125.50', paid_at: '2026-09-08', note: 'Recorded manually' },
] };
test('recorded payouts preserve event names and cents without inventing bank status', () => {
  const { rows, issues } = normalizeRecordedPayouts([event]);
  assert.equal(rows[0].amountCents, 12550);
  assert.equal(rows[0].eventName, 'Synthetic Open');
  assert.equal(rows[0].status, undefined);
  assert.deepEqual(rows[0].warnings, []);
  assert.deepEqual(issues, []);
});
test('malformed lists, amounts, dates and duplicates remain visible for review', () => {
  const result = normalizeRecordedPayouts([{ ...event, id: 2, organiser_interim_payments: {} }, { ...event, organiser_interim_payments: [
    { id: 'same', amount: 10, paid_at: '2026-02-30' }, { id: 'same', amount: '1.234', paid_at: '2026-09-08' }, null,
  ] }]);
  assert.equal(result.issues.length, 1);
  assert.equal(result.rows.length, 3);
  assert.equal(result.rows[1].amountCents, null);
  assert.ok(result.rows[0].warnings.includes('Duplicate record ID within event'));
  assert.equal(filterRecordedPayouts(result.rows, { reviewOnly: true }).length, 3);
});
test('filters use names and inclusive dates without mutating source', () => {
  const { rows } = normalizeRecordedPayouts([event]);
  assert.equal(filterRecordedPayouts(rows, { query: 'SYNTHETIC', from: '2026-09-08', to: '2026-09-08' }).length, 1);
  assert.equal(filterRecordedPayouts(rows, { from: '2026-09-09' }).length, 0);
});
test('payout loader denies delegated and scoped access before querying; reads all pages', async () => {
  const calls = [];
  const client = { from(table) { calls.push(table); let start; return { select(value) { assert.equal(value, 'id,event_name,organiser_name,organiser_interim_payments'); return this; }, order() { return this; }, range(a) { start = a; return this; }, then(resolve) { return Promise.resolve({ data: start < 2 ? [{ ...event, id: start }] : [] }).then(resolve); } }; } };
  const session = { user: { id: 'qa' } };
  await assert.rejects(loadRecordedPayouts(client, session, { role: 'custom' }, 'all'));
  await assert.rejects(loadRecordedPayouts(client, session, { role: 'super_admin' }, 'club'));
  assert.equal(calls.length, 0);
  const result = await loadRecordedPayouts(client, session, { role: 'super_admin' }, 'all');
  assert.equal(result.rows.length, 2);
  assert.equal(calls.length, 3);
});
