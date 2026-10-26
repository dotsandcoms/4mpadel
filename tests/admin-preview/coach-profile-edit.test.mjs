import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoachDraft, coachProfilePatch, saveCoachProfile } from '../../src/pages/admin-preview/coachProfileEdit.js';
const original = { id: 8, full_name: 'Jane Van Zyl', email: 'jane@example.test', coaching_location: 'Legacy club / Known club', bio: 'Coach bio', profile_pic_url: 'https://example.test/old.jpg', status: 'approved' };
function mock({ grant = { allowed_tabs: ['coaches'] }, fresh = original, fail = false, uploadFail = false } = {}) {
  const writes = [], uploads = [], removals = [], guards = [];
  const client = { writes, uploads, removals, guards, auth: { getUser: async () => ({ data: { user: { email: 'admin@example.test' } } }) }, from(table) {
    let patch;
    const query = { select: () => query, ilike: () => query, eq: (key, value) => { if (patch) guards.push([key, value]); return query; }, is: (key, value) => { guards.push([key, value]); return query; }, maybeSingle: async () => ({ data: grant }), single: async () => ({ data: patch ? { ...fresh, ...patch } : fresh, error: patch && fail ? new Error('Failed') : null }), update(value) { patch = value; writes.push(value); return query; } };
    return query;
  }, storage: { from(bucket) { assert.equal(bucket, 'coach-profiles'); return { upload: async (path, blob, options) => { uploads.push({ path, blob, options }); return { error: uploadFail ? new Error('Failed') : null }; }, getPublicUrl: path => ({ data: { publicUrl: `https://example.test/${path}` } }), remove: async paths => { removals.push(paths); return {}; } }; } } };
  return client;
}
test('source split name and club parsing preserve unknown stored clubs', () => {
  const draft = createCoachDraft(original);
  assert.equal(draft.firstName, 'Jane'); assert.equal(draft.lastName, 'Van Zyl'); assert.deepEqual(draft.clubs, ['Legacy club', 'Known club']);
  assert.deepEqual(coachProfilePatch(original, draft), {});
  assert.deepEqual(coachProfilePatch(original, { ...draft, firstName: 'Janet', clubs: ['Legacy club', 'New club'] }), { full_name: 'Janet Van Zyl', coaching_location: 'Legacy club · New club' });
});
test('club requirement and maximum match live source', () => {
  const draft = createCoachDraft(original);
  assert.throws(() => coachProfilePatch(original, { ...draft, clubs: [] }), /at least one/);
  assert.throws(() => coachProfilePatch(original, { ...draft, clubs: ['1', '2', '3', '4'] }), /up to 3/);
});
test('only changed profile fields update, guarded; status never changes', async () => {
  const client = mock();
  await saveCoachProfile(client, original, { ...createCoachDraft(original), bio: 'New bio', status: 'rejected' }, 'all');
  assert.deepEqual(client.writes, [{ bio: 'New bio' }]); assert.deepEqual(client.guards, [['id', 8], ['bio', 'Coach bio']]);
});
test('missing scope/grant and stale field cause zero writes', async () => {
  for (const [options, scope] of [[{}, 'org:1'], [{ grant: null }, 'all'], [{ fresh: { ...original, bio: 'Changed' } }, 'all']]) {
    const client = mock(options); await assert.rejects(saveCoachProfile(client, original, { ...createCoachDraft(original), bio: 'New' }, scope)); assert.equal(client.writes.length, 0);
  }
});
test('replacement uploads only on save and never deletes old photo, even row failure', async () => {
  const client = mock({ fail: true }); const file = { type: 'image/png', size: 20 };
  await assert.rejects(saveCoachProfile(client, original, createCoachDraft(original), 'all', { file, resize: async () => new Blob(['jpeg'], { type: 'image/jpeg' }) }), /Save could not/);
  assert.equal(client.uploads.length, 1); assert.equal(client.writes.length, 1); assert.equal(client.removals.length, 0);
  assert(client.guards.some(([key, value]) => key === 'profile_pic_url' && value === original.profile_pic_url));
});
test('failed upload does not change profile or delete photo', async () => {
  const client = mock({ uploadFail: true });
  await assert.rejects(saveCoachProfile(client, original, createCoachDraft(original), 'all', { file: { type: 'image/png', size: 1 }, resize: async () => new Blob(['jpeg']) }), /Photo upload failed/);
  assert.equal(client.writes.length, 0); assert.equal(client.removals.length, 0);
});
