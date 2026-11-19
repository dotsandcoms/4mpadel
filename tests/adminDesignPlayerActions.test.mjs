import assert from 'node:assert/strict';
import test from 'node:test';
import { deletePlayerProfile, readPlayerAccountPreview, sendPlayerRecoveryEmail } from '../src/pages/admin-preview/playerAccountActions.js';

const actor = { id: 'fixture-admin', email: 'admin@example.test' };
const player = { id: 12, name: 'Fixture Player', email: 'player@example.test' };
const context = { userId: actor.id, scopeId: 'all', isCurrent: () => true };

function fixture({ platform = true, actual = player, deleted = player.id } = {}) {
  const calls = [];
  let removing = false;
  const query = {
    select: () => query,
    eq: (column, value) => { calls.push(['filter', column, value]); return query; },
    single: async () => ({ data: actual }),
    delete: () => { calls.push(['remove']); removing = true; return query; },
    maybeSingle: async () => ({ data: removing ? { id: deleted } : null }),
  };
  const client = {
    auth: {
      getUser: async () => ({ data: { user: actor } }),
      resetPasswordForEmail: async (email, options) => { calls.push(['recovery', email, options]); return {}; },
    },
    rpc: async name => ({ data: name === 'account_is_active' || platform }),
    from: () => query,
  };
  return { client, calls };
}

test('password recovery verifies account and selected player, then uses the normal 4M reset email', async () => {
  const { client, calls } = fixture();
  await sendPlayerRecoveryEmail(client, player, context);
  assert.deepEqual(calls.at(-1), ['recovery', player.email, { redirectTo: 'https://4mpadel.co.za/reset-password' }]);
  const stale = fixture({ actual: { ...player, email: 'new-address@example.test' } });
  await assert.rejects(sendPlayerRecoveryEmail(stale.client, player, context), /record changed/i);
  assert.ok(stale.calls.every(call => call[0] !== 'recovery'));
});

test('profile deletion binds the reviewed id and email and denies nonplatform and other scopes', async () => {
  const { client, calls } = fixture();
  assert.equal(await deletePlayerProfile(client, player, context), 12);
  assert.deepEqual(calls.slice(-3), [['remove'], ['filter', 'id', 12], ['filter', 'email', player.email]]);
  const denied = fixture({ platform: false });
  await assert.rejects(deletePlayerProfile(denied.client, player, context), /super admin/);
  await assert.rejects(deletePlayerProfile(denied.client, player, { ...context, scopeId: 'org:other' }), /4M Padel scope/);
  assert.deepEqual(denied.calls, []);
});

test('account preview loads exact player entries, respects the partner status, and excludes unrelated registrations', async () => {
  const selected = { ...player, email: 'with_%@example.test' };
  const row = { id: 1, event_id: 20, division: 'Open', status: 'registered', calendar: { id: 20, event_name: 'Fixture open', start_date: '2035-01-20' } };
  const writes = [];
  const filters = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: actor } }) },
    rpc: async name => {
      assert.ok(['account_is_active', 'is_super_admin'].includes(name));
      return { data: true };
    },
    from(table) {
      let field, page;
      const query = {
        select: () => query,
        eq: (key, value) => { filters.push([table, key, value]); return query; },
        ilike: (key, value) => { field = key; filters.push([table, key, value]); return query; },
        neq: () => query, is: () => query, order: () => query,
        range: offset => { page = offset; return query; },
        single: () => ({ data: selected }),
        delete: () => writes.push(table),
        then(resolve) {
          const data = page > 0 ? [] : table === 'temporary_licenses' ? [{ id: 2 }]
            : field === 'email' ? [{ ...row, email: selected.email, payment_status: 'pending' }, { ...row, id: 5, email: 'other@example.test' }]
              : [{ ...row, id: 3, partner_email: selected.email.toUpperCase(), partner_payment_status: 'paid' }, { ...row, id: 4, partner_email: selected.email, status: 'withdrawn' }];
          return Promise.resolve({ data }).then(resolve);
        },
      };
      return query;
    },
  };
  const result = await readPlayerAccountPreview(client, selected, context);
  assert.deepEqual(result.entries.map(entry => [entry.id, entry.payment]), [[1, 'pending'], [3, 'paid']]);
  assert.deepEqual(result.licenses, [{ id: 2 }]);
  assert.deepEqual([...new Map(filters.map(filter => [JSON.stringify(filter), filter])).values()], [
    ['players', 'id', 12],
    ['event_registrations', 'email', 'with\\_\\%@example.test'],
    ['event_registrations', 'partner_email', 'with\\_\\%@example.test'],
    ['temporary_licenses', 'player_id', 12],
  ]);
  assert.deepEqual(writes, []);
  const revoked = { ...client, rpc: async name => ({ data: name === 'account_is_active' }) };
  await assert.rejects(readPlayerAccountPreview(revoked, selected, context), /super admin/);
  await assert.rejects(readPlayerAccountPreview(client, { ...selected, name: 'An outdated name' }, context), /record changed/i);
});
