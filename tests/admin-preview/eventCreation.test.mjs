import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyEventCreationAccess } from '../../src/pages/admin-preview/eventCreation.js';
function client({ user = { email: 'qa@example.test' }, role = 'super_admin', error = null } = {}) {
  return { auth: { getUser: async () => ({ data: { user } }) }, from(table) {
    assert.equal(table, 'admin_sidebar_permissions');
    return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role }, error }) }) }) };
  } };
}
test('creation checks fresh identity and role for saves and uploads', async () => {
  for (const operation of ['save', 'upload-cover', 'upload-sponsor']) {
    assert.ok((await verifyEventCreationAccess(client(), { operation })).user);
    await assert.rejects(verifyEventCreationAccess(client({ user: null }), { operation }), /Sign in/);
    await assert.rejects(verifyEventCreationAccess(client({ role: 'admin' }), { operation }), /super-admin/);
    await assert.rejects(verifyEventCreationAccess(client({ error: new Error('denied') }), { operation }), /super-admin/);
  }
});
test('creation cannot target existing events, divisions or series', async () => {
  for (const context of [{ event: { id: 1 } }, { sourceEvent: { id: 1 } }, { form: { series_id: 'a' } }, { payload: { series_id: 'a' } }, { divisions: [{ id: 1 }] }, { removedDivisionIds: [1] }]) {
    await assert.rejects(verifyEventCreationAccess(client(), context), /cannot update/);
  }
  await verifyEventCreationAccess(client(), { form: { is_weekly: true }, divisions: [{ name: 'Open', id: null }] });
});
