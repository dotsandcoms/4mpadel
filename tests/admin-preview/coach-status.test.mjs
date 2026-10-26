import test from 'node:test';
import assert from 'node:assert/strict';
import { saveCoachStatus } from '../../src/pages/admin-preview/coachStatus.js';
function mock({ grant = { allowed_tabs: ['coaches'] }, authError, result = { id: 1, status: 'approved' }, error } = {}) {
  const writes = [], guards = [], emails = [];
  const client = { auth: { getUser: async () => ({ data: { user: { email: 'qa_%@example.test' } }, error: authError }) }, from(table) {
    const q = { select: () => q, ilike: (key, value) => { emails.push(value); return q; }, maybeSingle: async () => ({ data: grant }), update: patch => { writes.push({ table, patch }); return q; }, eq: (key, value) => { guards.push([key, value]); return q; }, is: (key, value) => { guards.push([key, value]); return q; }, single: async () => ({ data: result, error }) }; return q;
  } }; return { client, writes, guards, emails };
}
test('coach decision matches source status-only update with literal authorization and status guard', async () => {
  const m = mock(); await saveCoachStatus(m.client, { id: 1, status: 'pending' }, 'approved', 'all');
  assert.deepEqual(m.writes, [{ table: 'coach_applications', patch: { status: 'approved' } }]);
  assert.deepEqual(m.guards, [['id', 1], ['status', 'pending']]);
  assert.equal(m.emails[0], 'qa\\_\\%@example.test');
});
test('scope, invalid status, expired auth and revoked access never write', async () => {
  for (const [options, scope, status] of [[{}, 'club-1', 'approved'], [{}, 'all', 'deleted'], [{ authError: {} }, 'all', 'approved'], [{ grant: {} }, 'all', 'approved']]) {
    const m = mock(options); await assert.rejects(saveCoachStatus(m.client, { id: 1, status: 'pending' }, status, scope)); assert.equal(m.writes.length, 0);
  }
});
test('same status is a no-op; null original status uses a null predicate', async () => {
  const m = mock(); await saveCoachStatus(m.client, { id: 1, status: 'approved' }, 'approved', 'all'); assert.equal(m.writes.length, 0);
  await saveCoachStatus(m.client, { id: 1, status: null }, 'rejected', 'all'); assert.deepEqual(m.guards.at(-1), ['status', null]);
});
test('conflicting or failed updates are never reported as confirmed', async () => {
  for (const options of [{ result: null }, { error: { message: 'Denied' } }]) await assert.rejects(saveCoachStatus(mock(options).client, { id: 1, status: 'pending' }, 'approved', 'all'), /could not be confirmed/);
});
