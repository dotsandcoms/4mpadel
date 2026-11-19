import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emailBroadcastAuthorized, reviewedBroadcastBatch } from '../supabase/functions/send-email/broadcast-authority.mjs';

function fixture({ email = 'editor%_@example.test', id = 'fictional-actor', active = true, superAdmin = false, rows = [], authError, permissionError } = {}) {
  const calls = [];
  const caller = {
    auth: { async getUser() { return { data: { user: { email, id } }, error: authError }; } },
    async rpc(name, args) {
      calls.push([name, args]);
      if (name === 'account_is_active') return { data: active };
      if (name === 'is_super_admin') return { data: superAdmin, error: permissionError };
      throw new Error('Unexpected fixture RPC');
    },
  };
  const admin = { from(table) { return { select(columns) { return { async ilike(column, pattern) {
    calls.push([table, columns, column, pattern]); return { data: rows };
  } }; } }; } };
  return { caller, admin, calls };
}

test('broadcast authorization permits current exact grants and platform authority', async () => {
  const delegated = fixture({ rows: [{ email: 'EDITOR%_@example.test', allowed_tabs: ['email-broadcast'] }] });
  assert.equal(await emailBroadcastAuthorized(delegated.caller, delegated.admin), true);
  assert.match(delegated.calls.at(-1).at(-1), /editor\\%\\_/);
  const platform = fixture({ superAdmin: true });
  assert.equal(await emailBroadcastAuthorized(platform.caller, platform.admin), true);
});

test('inactive, unauthenticated and unrelated admin accounts fail closed', async () => {
  for (const options of [
    { active: false, superAdmin: true },
    { permissionError: { message: 'Unavailable' }, superAdmin: true },
    { authError: { message: 'Signed out' } },
    { rows: [{ email: 'editor%_@example.test', allowed_tabs: ['calendar'] }] },
    { rows: [{ email: 'editornorth@example.test', allowed_tabs: ['email-broadcast'] }] },
    { rows: [{ email: 'editor%_@example.test', allowed_tabs: ['email-broadcast'] }, { email: 'EDITOR%_@example.test', allowed_tabs: ['email-broadcast'] }] },
  ]) {
    const mocked = fixture(options);
    assert.equal(await emailBroadcastAuthorized(mocked.caller, mocked.admin), false);
  }
  assert.equal(await emailBroadcastAuthorized(null, fixture().admin), false);
});

test('reviewed email requests accept a bounded, canonical BCC batch only', () => {
  const input = { id: '10000000-0000-4000-8000-000000000001', subject: 'Fictional subject', message: '<p>Example</p>', bcc: ['person@example.test'] };
  assert.equal(reviewedBroadcastBatch(input), true);
  for (const changed of [
    { to: 'unexpected@example.test' }, { id: 'old-request' }, { bcc: [] }, { bcc: ['valid@example.test', 'VALID@example.test'] },
    { bcc: Array.from({length: 50}, (_, index) => `person${index}@example.test`) }, { bcc: ['broken email'] }, { subject: 'Unsafe\nheader' },
  ]) assert.equal(reviewedBroadcastBatch({ ...input, ...changed }), false);
});
