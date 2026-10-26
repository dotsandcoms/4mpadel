import test from 'node:test';
import assert from 'node:assert/strict';
import { createFullClubDraft, fullClubProfilePatch, loadFullClubEditor, saveFullClubProfile, uploadFullClubImage } from '../../src/pages/admin-preview/fullClubProfile.js';
const original = { id: 'club-1', name: 'Club One', slug: 'club-one', status: 'draft', about: null, updated_at: '2026-01-01', socials: { instagram: 'old', legacy: 'keep' }, courts: { indoor: { count: 2, features: ['A'], custom: 'keep' } }, gallery: [{ url: 'photo', caption: 'Original', extra: 1 }] };
function mock({ current = original, groups = [], grant = { role: 'super_admin' }, error = null } = {}) {
  const writes = [], guards = [], uploaded = [], reads = [];
  return { writes, guards, uploaded, reads, auth: { getUser: async () => ({ data: { user: { email: 'admin@example.test' } } }) }, from(table) {
    let patch; const q = { select: () => q, ilike: () => q, order: () => q, eq: (key, value) => { if (patch) guards.push([key, value]); return q; }, is: (key, value) => { guards.push([key, value]); return q; }, update(value) { writes.push(value); patch = value; return q; }, maybeSingle: async () => ({ data: grant }), single: async () => ({ data: patch ? { ...current, ...patch } : current, error: patch ? error : null }), range: async (from, to) => { reads.push([table, from, to]); return { data: (table === 'club_groups' ? groups : []).slice(from, to + 1) }; } }; return q;
  }, storage: { from(bucket) { assert.equal(bucket, 'profile-pics'); return { upload: async (path, file, options) => { uploaded.push({ path, file, options }); return {}; }, getPublicUrl: path => ({ data: { publicUrl: `https://example.test/${path}` } }) }; } } };
}
test('unchanged defaults/legacy status/nested extras remain untouched', () => {
  const draft = createFullClubDraft(original); assert.equal(draft.status, 'unclaimed');
  assert.deepEqual(fullClubProfilePatch(original, draft), {});
  assert.deepEqual(fullClubProfilePatch(original, { ...draft, about: 'New' }), { about: 'New' });
});
test('nested payloads and source scalar normalization', () => {
  const draft = createFullClubDraft(original);
  assert.deepEqual(fullClubProfilePatch(original, { ...draft, short_name: ' X ', slug: 'New CLUB!', lat: '12.5', gallery: [...draft.gallery, { url: 'two', category: 'other', caption: 'Two' }] }), { short_name: 'X', slug: 'new-club', lat: 12.5, gallery: [{ url: 'photo', caption: 'Original', extra: 1 }, { url: 'two', category: 'other', caption: 'Two' }] });
});
test('group changes apply shared branding, unavailable group blocks', () => {
  const groups = [{ id: 'g', share_logo: true, logo_url: 'group-logo', share_website: true, website_url: 'group-site' }];
  assert.deepEqual(fullClubProfilePatch(original, { ...createFullClubDraft(original), group_id: 'g' }, groups), { group_id: 'g', logo_url: 'group-logo', website_url: 'group-site' });
  assert.throws(() => fullClubProfilePatch(original, { ...createFullClubDraft(original), group_id: 'missing' }), /unavailable/);
});
test('shared branding refresh is reviewed and saved even when group is unchanged', async () => {
  const row = { ...original, group_id: 'g', website_url: 'stale-site', logo_url: 'stale-logo' };
  const groups = [{ id: 'g', share_website: true, website_url: 'current-site', share_logo: true, logo_url: 'current-logo' }];
  const draft = createFullClubDraft(row), expected = { website_url: 'current-site', logo_url: 'current-logo' };
  assert.deepEqual(fullClubProfilePatch(row, draft, groups), expected);
  const client = mock({ current: row, groups });
  await saveFullClubProfile({ client, scopeId: 'all', original: row, draft, groups });
  const { updated_at, ...patch } = client.writes[0];
  assert.deepEqual(patch, expected); assert(updated_at);
  assert.throws(() => fullClubProfilePatch(row, draft, []), /unavailable/);
});
test('slug uses exact live ASCII substitution, not accent transliteration; unknown draft fields never write', () => {
  assert.deepEqual(fullClubProfilePatch(original, { ...createFullClubDraft(original), slug: 'Élite Café / Club', organisation_id: 'x', approved_at: 'now' }), { slug: 'lite-caf-club' });
});
test('fresh authority and full snapshot changes block before writes', async () => {
  for (const options of [{ grant: null }, { current: { ...original, status: 'published' } }, { current: { ...original, gallery: [] } }]) {
    const client = mock(options); await assert.rejects(saveFullClubProfile({ client, scopeId: 'all', original, draft: { ...createFullClubDraft(original), name: 'Changed' } })); assert.equal(client.writes.length, 0);
  }
});
test('group snapshot refresh blocks stale inherited data', async () => {
  const row = { ...original, group_id: 'g' }, groups = [{ id: 'g', share_logo: true, logo_url: 'old' }];
  const client = mock({ current: row, groups: [{ ...groups[0], logo_url: 'new' }] });
  await assert.rejects(saveFullClubProfile({ client, scopeId: 'all', original: row, draft: { ...createFullClubDraft(row), name: 'Changed' }, groups }), /group settings changed/);
  assert.equal(client.writes.length, 0);
});
test('save sends minimal patch and original predicates', async () => {
  const client = mock(); const result = await saveFullClubProfile({ client, scopeId: 'all', original, draft: { ...createFullClubDraft(original), gallery: [] } });
  assert.equal(result.changed, true); assert.deepEqual(Object.keys(client.writes[0]).sort(), ['gallery', 'updated_at']); assert(client.guards.some(([key, value]) => key === 'gallery' && value === JSON.stringify(original.gallery)));
});
test('options paginate and uploads guard authority without changing club', async () => {
  const client = mock({ groups: Array.from({ length: 501 }, (_, i) => ({ id: i })) });
  assert.equal((await loadFullClubEditor(client, 'all', original.id)).groups.length, 501);
  const url = await uploadFullClubImage({ client, scopeId: 'all', original, kind: 'logo', file: { type: 'image/png', size: 2, name: 'pic.png' } });
  assert.match(url, /clubs\/logo\/club-1_.*\.png$/); assert.equal(client.writes.length, 0); assert.equal(client.uploaded[0].options.upsert, false);
});
