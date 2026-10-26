import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayerProfileDraft, PROFILE_FIELDS, profilePatch, savePlayerProfile, verifyPlayerEditAccess } from '../../src/pages/admin-preview/playerProfileEdit.js';
const original = { id: 7, name: 'Player One', contact_number: null, nationality: 'South African', racket_brand: '', bio: 'Original' };
function mock({ grant = { allowed_tabs: ['players'] }, fresh = original, writeError = null, user = { email: 'admin@example.test' } } = {}) {
  const writes = [], predicates = [], matches = [];
  return { writes, predicates, matches, auth: { getUser: async () => ({ data: { user } }) }, from(table) {
    let patch;
    const query = { select: () => query, ilike: (key, value) => { matches.push([table, key, value]); return query; }, eq: (key, value) => { if (patch) predicates.push([key, value]); return query; }, is: (key, value) => { predicates.push([key, value]); return query; }, maybeSingle: async () => ({ data: grant }), single: async () => ({ data: patch ? { ...fresh, ...patch } : fresh, error: patch ? writeError : null }), update(value) { patch = value; writes.push(value); return query; } };
    return query;
  } };
}
const draft = { ...original, contact_number: '', bio: 'Updated' };
test('bound editor refuses switched actor, scope and expired context before saving', async () => {
  for (const context of [{userId:'old',scopeId:'all',isCurrent:()=>true},{userId:'new',scopeId:'club:1',isCurrent:()=>true},{userId:'new',scopeId:'all',isCurrent:()=>false}]) {
    const client=mock({user:{id:'new',email:'admin@example.test'}});
    await assert.rejects(savePlayerProfile(client,original,draft,[],context));
    assert.equal(client.writes.length,0);
  }
});
test('authorization email escapes every SQL wildcard and escape character literally', async () => {
  const client = mock({ user: { email: 'Admin_%\\name@example.test' } });
  await verifyPlayerEditAccess(client);
  assert.deepEqual(client.matches, [['admin_sidebar_permissions', 'email', 'Admin\\_\\%\\\\name@example.test']]);
  assert.equal(client.writes.length, 0);
});
test('patch includes full live-editor fields but no unknown fields', () => {
  assert.deepEqual(profilePatch(original, { ...draft, email: 'new@example.test', points: '900', approved: false, license_type: 'full', account_type: 'admin' }), { points: 900, bio: 'Updated', email: 'new@example.test', approved: false });
  assert.throws(() => profilePatch(original, { ...draft, name: ' ' }), /name is required/);
});
test('draft preserves live defaults without writing those defaults on unrelated edits', () => {
  const row = { id: 8, name: 'Legacy', points: null, sponsors: '["Brand A","Brand B"]', approved: null, paid_registration: null, club_id: null, home_club: 'Legacy venue', license_type: null };
  const values = createPlayerProfileDraft(row);
  assert.deepEqual(Object.keys(values).sort(), [...PROFILE_FIELDS].sort());
  assert.equal(values.sponsors, 'Brand A, Brand B'); assert.equal(values.approved, true); assert.equal(Object.hasOwn(values,'paid_registration'), false); assert.equal(Object.hasOwn(values,'license_type'), false);
  assert.deepEqual(profilePatch(row, values), {});
  assert.deepEqual(profilePatch(row, { ...values, name: 'Renamed' }), { name: 'Renamed' });
});
test('points, sponsors and approval conversions follow source; licence projections excluded', () => {
  const values = createPlayerProfileDraft(original);
  assert.deepEqual(profilePatch(original, { ...values, points: '123.9', sponsors: ' A, , B ', paid_registration: true, license_type: 'temporary', approved: false }), { points: 123, sponsors: '["A","B"]', approved: false });
  assert.deepEqual(profilePatch({ ...original, points: 5 }, { ...values, points: '' }), { points: 0 });
});
test('club changes map ID and display name together; untouched links need no lookup', () => {
  const row = { ...original, club_id: 'club-1', home_club: 'Old Club' }, values = createPlayerProfileDraft(row);
  assert.deepEqual(profilePatch(row, values), {});
  assert.deepEqual(profilePatch(row, { ...values, club_id: 'club-2' }, [{ id: 'club-2', name: 'New Club' }]), { club_id: 'club-2', home_club: 'New Club' });
  assert.deepEqual(profilePatch(row, { ...values, club_id: 'Other', home_club: 'Custom Club' }), { club_id: null, home_club: 'Custom Club' });
  assert.throws(() => profilePatch(row, { ...values, club_id: 'missing' }), /unavailable/);
});
test('ordinary profile update checks permission and guards changed fields', async () => {
  const client = mock(); const saved = await savePlayerProfile(client, original, draft);
  assert.equal(saved.bio, 'Updated'); assert.deepEqual(client.writes, [{ bio: 'Updated' }]);
  assert.deepEqual(client.predicates, [['id', 7], ['bio', 'Original']]);
});
test('missing authority makes no writes', async () => {
  for (const options of [{ grant: null }, { grant: { allowed_tabs: ['calendar'] } }, { user: null }]) {
    const client = mock(options); await assert.rejects(savePlayerProfile(client, original, draft)); assert.equal(client.writes.length, 0);
  }
});
test('concurrent edits block writes but unrelated edits are preserved', async () => {
  const changed = mock({ fresh: { ...original, bio: 'Someone else' } });
  await assert.rejects(savePlayerProfile(changed, original, draft), /changed since/); assert.equal(changed.writes.length, 0);
  const unrelated = mock({ fresh: { ...original, name: 'Renamed' } });
  assert.equal((await savePlayerProfile(unrelated, original, draft)).name, 'Renamed');
});
test('failed write is not reported as success; null originals use is predicate', async () => {
  const client = mock({ writeError: new Error('RLS') });
  await assert.rejects(savePlayerProfile(client, original, { ...draft, contact_number: '123' }), /could not be confirmed/);
  assert(client.predicates.some(([key, value]) => key === 'contact_number' && value === null));
});
test('forged licence flag edits never reach profile writes, including after projection changes', async () => {
  const row = { ...original, license_type: 'temporary', paid_registration: true };
  const values = { ...createPlayerProfileDraft(row), license_type: 'full' };
  const concurrent = mock({ fresh: { ...row, paid_registration: false } });
  await savePlayerProfile(concurrent, row, values);
  assert.deepEqual(concurrent.writes, []);
  const client = mock({ fresh: row });
  await savePlayerProfile(client, row, values);
  assert.deepEqual(client.writes, []);
  assert.equal(PROFILE_FIELDS.includes('paid_registration'),false);
  assert.equal(PROFILE_FIELDS.includes('license_type'),false);
});
