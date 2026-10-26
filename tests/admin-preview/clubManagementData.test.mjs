import test from 'node:test';
import assert from 'node:assert/strict';
import { loadClubManagement, clubClaimDecisionArguments } from '../../src/pages/admin-preview/clubManagementData.js';
const session = { user: { id: 'qa' } }, permissions = { role: 'super_admin' };
test('club management reads remain exact-club scoped and follow server pagination', async () => {
  const queried = [];
  const client = { from(table) { queried.push(table); let start;
    return { select(columns) { assert.ok(!columns.includes('*')); assert.ok(!columns.includes('token')); return this; }, eq(column, value) { assert.equal(column, 'club_id'); assert.equal(value, 'club-one'); return this; }, order() { return this; }, range(value) { start=value; return this; }, then(resolve) { return Promise.resolve({ data: start < 2 ? [{ id: start }] : [] }).then(resolve); } };
  } };
  const result = await loadClubManagement(client, session, permissions, 'all', 'club-one');
  assert.equal(result.members.length, 2); assert.equal(result.claims.length, 2);
  assert.ok(queried.includes('club_members')); assert.ok(queried.includes('club_claim_requests'));
});
test('club management denies scoped/custom access before querying and propagates failures', async () => {
  const client = { from() { throw Error('Read failed'); } };
  await assert.rejects(loadClubManagement(client, session, { role: 'custom' }, 'all', 'club-one'), /Platform/);
  await assert.rejects(loadClubManagement(client, session, permissions, 'club-one', 'club-one'), /Platform/);
  await assert.rejects(loadClubManagement(client, session, permissions, 'all', 'club-one'), /Read failed/);
});
test('claim decision payload contains no client-selected recipient, role or player', () => {
  const claim = { id: 'claim', status: 'pending', requester_email: 'ignored@example.invalid', requester_player_id: 42 };
  assert.deepEqual(clubClaimDecisionArguments(claim, 'approved'), { p_claim_id: 'claim', p_decision: 'approved', p_rejection_notes: null });
  assert.throws(() => clubClaimDecisionArguments(claim, 'rejected'), /feedback is required/);
  assert.throws(() => clubClaimDecisionArguments({ ...claim, status: 'approved' }, 'approved'), /pending/);
  assert.equal(clubClaimDecisionArguments(claim, 'rejected', ' Evidence required ').p_rejection_notes, 'Evidence required');
});
