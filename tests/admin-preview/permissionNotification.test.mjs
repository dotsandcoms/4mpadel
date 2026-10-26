import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSavedPermissionNotification, permissionNotificationGate } from '../../supabase/functions/_shared/permissionNotification.js';

test('notification dispatch requires trusted service and explicit enablement', () => {
  assert.equal(permissionNotificationGate(false, 'true').status, 403);
  assert.equal(permissionNotificationGate(false, undefined).status, 403);
  for (const value of [undefined, '', 'false', true, 'TRUE']) assert.equal(permissionNotificationGate(true, value).status, 409);
  assert.equal(permissionNotificationGate(true, 'true'), null);
});
test('notification refuses recipient lists or BCC before querying', async () => {
  for (const to of [null, [], ['a@example.com'], '', 'a@example.com,b@example.com', 'a@example.com\nb@example.com']) await assert.rejects(buildSavedPermissionNotification({}, to), /one recipient/);
  await assert.rejects(buildSavedPermissionNotification({}, 'a@example.com', 'b@example.com'), /no BCC/);
});
function clientFor(record, error = null) {
  return { from(table) {
    assert.equal(table, 'admin_sidebar_permissions');
    return { select(fields) { assert.equal(fields, 'email,role,allowed_tabs,module_permissions'); return this; }, eq(field, value) { assert.equal(field, 'email'); assert.equal(value, 'a@example.com'); return this; }, maybeSingle() { return Promise.resolve({ data: record, error }); } };
  } };
}
test('notification reads exact persisted permissions, not caller-provided content', async () => {
  const email = await buildSavedPermissionNotification(clientFor({ email: 'a@example.com', role: 'custom', allowed_tabs: ['event-mgmt'], module_permissions: { 'event-mgmt': { allowedEvents: [517] } } }), ' A@example.com ');
  assert.match(email.text, /Event Manager/);
  assert.match(email.text, /Event #517/);
  assert.doesNotMatch(email.text, /Super admin/);
});
test('missing, mismatched or unsupported records cannot produce a notification', async () => {
  for (const record of [null, { email: 'other@example.com' }, { email: 'a@example.com', role: 'unknown' }]) await assert.rejects(buildSavedPermissionNotification(clientFor(record), 'a@example.com'));
  await assert.rejects(buildSavedPermissionNotification(clientFor(null, new Error('denied')), 'a@example.com'), /denied/);
});
