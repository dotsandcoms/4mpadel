import test from 'node:test';
import assert from 'node:assert/strict';
import { coverageStatus, groupLicensePayments } from '../src/utils/licenseReporting.js';

test('groups a checkout and its license allocation without adding the amounts again', () => {
  const parent = { id: 'entry', reference: 'REGEV-1', amount: 600, checkout_amount: 720, split_recorded: true, bundled: true, status: 'success' };
  const license = { id: 'license', reference: 'LIC-REGEV-1', amount: 120, bundled: false, status: 'success' };
  const attempt = { id: 'attempt', reference: 'REGEV-2', amount: 720, bundled: true, status: 'processing' };
  const result = groupLicensePayments([license, parent, attempt]);
  assert.equal(result.length, 2);
  assert.equal(result[0].checkout_amount, 720);
  assert.equal(result[0].amount, 600);
  assert.deepEqual(result[0].allocations, [license]);
  assert.deepEqual(result[1].allocations, []);
});

test('uses explicit parent references for numbered multi-player splits', () => {
  const records = [
    { id: 'parent', reference: 'REGEV-1', bundled: true },
    { id: 'child', reference: 'LIC-REGEV-1-2', parent_reference: 'REGEV-1', bundled: false },
    { id: 'unrelated', reference: 'REGEV-10', bundled: true },
  ];
  const groups = groupLicensePayments(records);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].allocations[0].id, 'child');
});

test('does not infer duplicate charges from the same event, time or amount', () => {
  const rows = [1, 2].map(id => ({ id, bundled: true, event_name: 'Same event', created_at: '2026-11-02T11:19:00Z', amount: 720 }));
  assert.equal(groupLicensePayments(rows).length, 2);
  assert.equal(groupLicensePayments([{ id: 'orphan', reference: 'LIC-no-parent', amount: 120 }]).length, 1);
});

test('keeps different currencies and test/live records separate', () => {
  const parent = { id: 'p', reference: 'checkout', bundled: true, currency: 'ZAR' };
  assert.equal(groupLicensePayments([parent, { id: 'c', parent_reference: 'checkout', currency: 'USD' }]).length, 2);
  assert.equal(groupLicensePayments([parent, { id: 'c', parent_reference: 'checkout', currency: 'ZAR', is_test: true }]).length, 2);
});

test('future event coverage is clearly upcoming, with inclusive coverage boundaries', () => {
  const row = { status: 'active', starts_on: '2026-11-06', ends_on: '2026-11-08' };
  assert.equal(coverageStatus(row, '2026-11-02'), 'upcoming');
  assert.equal(coverageStatus(row, '2026-11-06'), 'active');
  assert.equal(coverageStatus(row, '2026-11-08'), 'active');
  assert.equal(coverageStatus(row, '2026-11-09'), 'expired');
  assert.equal(coverageStatus({ ...row, status: 'revoked' }, '2026-11-02'), 'revoked');
});
