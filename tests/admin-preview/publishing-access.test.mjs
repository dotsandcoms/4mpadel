import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyPublishingAccess } from '../../src/pages/admin-preview/publishingAccess.js';
import { SUPER_ADMIN_EMAILS } from '../../src/utils/adminIdentity.js';

function client({ email = 'operator@example.invalid', userId = 'actor', rows = [], error = null } = {}) {
  const result = { reads: 0, auth: { getUser: async () => ({ data: { user: { id: userId, email } } }) }, from() {
    let offset = 0;
    return { select() { return this; }, ilike() { return this; }, order() { return this; }, range(start) { offset = start; return this; }, abortSignal() { return this; }, then(resolve) { result.reads++; return Promise.resolve({ data: rows.slice(offset, offset + 1), error }).then(resolve); } };
  } };
  return result;
}
const check = (c, module = 'gallery', overrides = {}) => verifyPublishingAccess(c, overrides.scope || 'all', overrides.user || 'actor', module, overrides.signal);
const grant = extra => ({ email: 'operator@example.invalid', role: 'custom', allowed_tabs: [], module_permissions: {}, ...extra });

test('source superadmin allowlist uses fresh identity and preserves read access', async () => {
  for (const email of SUPER_ADMIN_EMAILS) { const c = client({ email: ` ${email.toUpperCase()} ` }); assert.equal((await check(c, 'email-broadcast')).role, 'super_admin'); assert.equal(c.reads, 0); }
  await assert.rejects(check(client({ email: SUPER_ADMIN_EMAILS[0], userId: 'other' })), /account changed/);
});
test('Gallery album assignments grant access without a direct tab, but do not grant broadcasts', async () => {
  const c = client({ rows: [grant({ module_permissions: { gallery: { allowedAlbums: [17] } } })] });
  assert.deepEqual((await check(c)).module_permissions.gallery.allowedAlbums, [17]);
  await assert.rejects(check(c, 'email-broadcast'), /Email broadcast/);
});
test('fresh direct tab and database superadmin work, unrelated grants fail closed', async () => {
  assert.equal((await check(client({ rows: [grant({ allowed_tabs: ['email-broadcast'] })] }), 'email-broadcast')).role, 'custom');
  assert.equal((await check(client({ rows: [grant({ role: 'super_admin' })] }))).role, 'super_admin');
  for (const rows of [[], [grant({ allowed_tabs: ['event-mgmt'] })], [grant({ allowed_tabs: 'email-broadcast' })], [grant(), grant()]]) await assert.rejects(check(client({ rows }), 'email-broadcast'));
  await assert.rejects(check(client({ error: new Error('Grant lookup failed') })), /Grant lookup/);
});
test('grant identity is exact after pagination, including literal wildcard emails', async () => {
  const c = client({ email: 'literal*name@example.invalid', rows: [grant({ email: 'literal-other-name@example.invalid', role: 'super_admin' }), grant({ email: ' LITERAL*NAME@example.invalid ', allowed_tabs: ['gallery'] })] });
  assert.equal((await check(c)).role, 'custom');
  await assert.rejects(check(client({ email: 'literal*name@example.invalid', rows: [grant({ email: 'literal-other-name@example.invalid', role: 'super_admin' })] })));
});
test('scope, unsigned account and cancellation stop data reads', async () => {
  for (const override of [{ scope: 'club:17' }, { user: 'other' }]) { const c = client(); await assert.rejects(check(c, 'gallery', override)); assert.equal(c.reads, 0); }
  const abort = new AbortController(); abort.abort(); const c = client(); await assert.rejects(check(c, 'gallery', { signal: abort.signal }), { name: 'AbortError' }); assert.equal(c.reads, 0);
});
