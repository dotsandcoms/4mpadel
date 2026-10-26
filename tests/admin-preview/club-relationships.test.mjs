import test from 'node:test';
import assert from 'node:assert/strict';
import { loadClubOrganisations, loadClubGroupDirectory, reviewClubOrganisation, safeClubRelationshipImage } from '../../src/pages/admin-preview/clubRelationships.js';

function mock(tables = {}, role = 'super_admin', cap = 500) {
  const calls = [];
  return { calls, rpc: async name => ({ data: name === 'account_is_active' || role === 'super_admin' }), auth: { getUser: async () => ({ data: { user: { id: 'actor', email: 'admin@example.test' } } }) }, from(table) {
    calls.push(table); let start = 0, end = 499;
    const query = { select() { return this; }, eq() { return this; }, ilike() { return this; }, order() { return this; }, abortSignal() { return this; }, range(a, b) { start = a; end = b; return this; }, maybeSingle: async () => ({ data: { role } }), then(resolve) { return Promise.resolve({ data: (tables[table] || []).slice(start, Math.min(end + 1, start + cap)) }).then(resolve); } };
    return query;
  } };
}
const args = client => ({ client, userId: 'actor', scopeId: 'all', clubId: 'club' });
test('fresh authority and identity are required before relationship reads', async () => {
  const denied = mock({}, 'admin'); await assert.rejects(loadClubOrganisations(args(denied)), /super-admin/);
  assert.deepEqual(denied.calls, []);
  const switched = mock(); await assert.rejects(loadClubOrganisations({ ...args(switched), userId: 'other' }), /account changed/);
  assert.deepEqual(switched.calls, []);
});
test('honours lower server row caps without truncation', async () => {
  const client = mock({ organisations: Array.from({ length: 5 }, (_, id) => ({ id })) }, 'super_admin', 2);
  assert.equal((await loadClubOrganisations(args(client))).organisations.length, 5);
});
test('exact email RPC, active account and final identity checks fail closed', async () => {
  const client = mock(); const calls = [];
  client.auth.getUser = async () => ({ data: { user: { id: 'actor', email: 'literal*_%@example.test' } } });
  client.rpc = async (name, params) => { calls.push([name, params]); return { data: true }; };
  await loadClubOrganisations(args(client)); assert.deepEqual(calls[1], ['is_super_admin', { user_email: 'literal*_%@example.test' }]);
  client.rpc = async () => ({ data: false }); await assert.rejects(loadClubOrganisations(args(client)), /active account/);
  client.rpc = async () => ({ data: true }); let reads = 0;
  client.auth.getUser = async () => ({ data: { user: { id: ++reads === 1 ? 'actor' : 'changed', email: 'a@example.test' } } });
  await assert.rejects(loadClubOrganisations(args(client)), /account changed/);
});
test('image source accepts only absolute http and https URLs', () => {
  for (const input of ['javascript:alert(1)', 'data:image/png;base64,x', '/relative', 'file:///tmp/image']) assert.equal(safeClubRelationshipImage(input), null);
  assert.equal(safeClubRelationshipImage('https://example.test/logo.png'), 'https://example.test/logo.png');
});
test('loads all pages and retains unresolved linked organisations', async () => {
  const client = mock({ club_organisations: [{ id: 'link', club_id: 'club', organisation_id: 'unknown', organisations: null }], organisations: Array.from({ length: 501 }, (_, id) => ({ id, name: `Org ${id}` })) });
  const result = await loadClubOrganisations(args(client)); assert.equal(result.organisations.length, 501); assert.equal(result.links.length, 1);
  const review = reviewClubOrganisation({ club: { id: 'club', name: 'Club' }, snapshot: result, organisationId: 'unknown', action: 'unlink' });
  assert.equal(review.held, true); assert.equal(review.organisation.name, 'Organisation unavailable');
});
test('rejects cross-club reads and invalid review choices without mutations', async () => {
  await assert.rejects(loadClubOrganisations(args(mock({ club_organisations: [{ club_id: 'other' }] }))), /scope/);
  const snapshot = { links: [{ organisation_id: 'one' }], organisations: [{ id: 'one' }, { id: 'two', name: 'Two' }] };
  const options = { club: { id: 'club' }, snapshot, organisationId: 'one', action: 'link' };
  assert.throws(() => reviewClubOrganisation(options), /already linked/);
  assert.throws(() => reviewClubOrganisation({ ...options, organisationId: 'missing', action: 'unlink' }), /no longer linked/);
  const review = reviewClubOrganisation({ ...options, organisationId: 'two' }); snapshot.organisations[1].name = 'Changed'; assert.equal(review.organisation.name, 'Two');
});
test('group directory uses recorded group association, not names', async () => {
  const groups = await loadClubGroupDirectory(args(mock({ club_groups: [{ id: 'g', name: 'Group' }], clubs: [{ id: 'a', group_id: 'g' }, { id: 'b', group_id: null }] })));
  assert.deepEqual(groups[0].venues.map(row => row.id), ['a']);
});
