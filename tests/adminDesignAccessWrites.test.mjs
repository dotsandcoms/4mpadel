import assert from 'node:assert/strict';
import test from 'node:test';
import { removeAccessGrant, saveAccessGrant } from '../src/pages/admin-preview/permissionsWrites.js';

const session = { user: { id: 'platform-fixture', email: 'admin@example.test' } };
const record = { email: 'ops@example.test', role: 'custom', allowed_tabs: ['calendar'], module_permissions: { calendar: { readOnly: true } } };
const draft = { ...record, allowed_tabs: ['calendar', 'event-mgmt'], module_permissions: { ...record.module_permissions, 'event-mgmt': { allowedEvents: [42] } } };

function fixture({ platform = true, current = true } = {}) {
  const calls = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: session.user } }) },
    rpc: async name => ({ data: name === 'account_is_active' || platform }),
    from: table => {
      let mutation = false;
      const query = {
        select: () => query,
        insert: values => { calls.push(['insert', table, values]); mutation = true; return query; },
        update: values => { calls.push(['update', table, values]); mutation = true; return query; },
        delete: () => { calls.push(['delete', table]); mutation = true; return query; },
        eq: (column, value) => { calls.push(['eq', column, value]); return query; },
        filter: (field, op, value) => { calls.push(['compare', field, op, value]); return query; },
        maybeSingle: async () => ({
          data: table === 'players' ? { id: 3, email: record.email } : current && mutation ? { email: record.email } : null,
        }),
      };
      return query;
    },
  };
  return { client, calls };
}

test('new Admin permissions verify the selected existing player before creating a scoped grant', async () => {
  const { client, calls } = fixture();
  await saveAccessGrant(client, session, { ...record, isNew: true, profile: { id: 3 } }, draft);
  assert.deepEqual(calls[0], ['eq', 'id', 3]);
  assert.deepEqual(calls[1], ['insert', 'admin_sidebar_permissions', draft]);
});

test('updates and removal bind to the reviewed email, role, modules and granular scope', async () => {
  const verified = fixture();
  await saveAccessGrant(verified.client, session, record, draft);
  assert.deepEqual(verified.calls.slice(1), [
    ['eq', 'email', record.email],
    ['compare', 'role', 'eq', 'custom'],
    ['compare', 'allowed_tabs', 'eq', '{"calendar"}'],
    ['compare', 'module_permissions', 'eq', '{"calendar":{"readOnly":true}}'],
  ]);
  const remove = fixture({ current: false });
  await assert.rejects(removeAccessGrant(remove.client, session, record), /Removal was not confirmed/);
  assert.deepEqual(remove.calls.slice(1), verified.calls.slice(1));
});

test('revoked and mismatched accounts are denied before touching permission records', async () => {
  const denied = fixture({ platform: false });
  await assert.rejects(saveAccessGrant(denied.client, session, record, draft), /Current platform administrator/);
  await assert.rejects(removeAccessGrant(denied.client, { user: { id: 'different', email: session.user.email } }, record), /account changed/);
  assert.deepEqual(denied.calls, []);
});
