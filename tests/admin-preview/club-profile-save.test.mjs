import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clubProfilePatch, saveClubProfile } from '../../src/pages/admin-preview/saveClubProfile.js';
function fixture() {
  const original = { id: 1, name: 'Club', short_name: null, about: 'About', city: 'Cape Town', address: 'Road', contact_email: 'club@test.co.za', contact_phone: null, whatsapp_number: null, updated_at: '2026-09-22T00:00:00Z' };
  const state = { current: { ...original }, role: 'super_admin', writes: [], conflict: false };
  const client = { auth: { async getUser() { return { data: { user: { email: 'admin@test.co.za' } } }; } }, from(table) {
    let patch = null; const filters = [];
    const query = { select() { return query; }, eq(key, value) { filters.push([key, value]); return query; }, is(key, value) { filters.push([key, value]); return query; },
      update(value) { patch = value; state.writes.push({ patch, filters }); return query; },
      async single() { return { data: { ...state.current } }; },
      async maybeSingle() { if (table === 'admin_sidebar_permissions') return { data: { role: state.role } }; return { data: state.conflict ? null : { ...state.current, ...patch } }; },
    }; return query;
  } };
  return { state, args: { client, original, draft: { name: 'Updated club' }, scopeId: 'all' } };
}
test('club save patches only ordinary supported fields with original-value conflict predicates', async () => {
  const f = fixture(); f.args.draft.status = 'published'; f.args.draft.website_url = 'https://changed.test';
  const result = await saveClubProfile(f.args);
  assert.equal(result.record.name, 'Updated club');
  assert.deepEqual(Object.keys(f.state.writes[0].patch).sort(), ['name', 'updated_at']);
  assert(f.state.writes[0].filters.some(([key, value]) => key === 'updated_at' && value === f.args.original.updated_at));
});
test('club save denies stale snapshots and changed roles without writing', async () => {
  for (const change of [state => { state.current.contact_email = 'new@test.co.za'; }, state => { state.role = 'admin'; }]) {
    const f = fixture(); change(f.state); await assert.rejects(saveClubProfile(f.args)); assert.equal(f.state.writes.length, 0);
  }
  const f = fixture(); f.args.scopeId = 'club:1'; await assert.rejects(saveClubProfile(f.args)); assert.equal(f.state.writes.length, 0);
});
test('club save does not claim success when conditional update matches no record', async () => {
  const f = fixture(); f.state.conflict = true; await assert.rejects(saveClubProfile(f.args), /could not be confirmed/);
});
test('club patch validates names/email and preserves main contact normalization', () => {
  const { args } = fixture();
  assert.throws(() => clubProfilePatch(args.original, { name: '' }), /club name/);
  assert.throws(() => clubProfilePatch(args.original, { contact_email: 'invalid' }), /email/);
  assert.deepEqual(clubProfilePatch(args.original, { short_name: ' Short ', contact_phone: ' 123 ' }), { short_name: 'Short', contact_phone: ' 123 ' });
  assert.deepEqual(clubProfilePatch(args.original, { contact_email: '' }), { contact_email: null });
});
