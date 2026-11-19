import assert from 'node:assert/strict';
import test from 'node:test';
import { deletePlayerProfile, sendPlayerRecoveryEmail } from '../src/pages/admin-preview/playerAccountActions.js';

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
