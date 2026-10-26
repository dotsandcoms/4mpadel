import test from 'node:test';
import assert from 'node:assert/strict';
import { accessDraft, accessChanges, canManageAccess, searchAccessUsers, loadAccessDirectory, loadAccessAlbums } from '../../src/pages/admin-preview/permissionsData.js';

test('album restriction changes participate in review without mutating the original', () => {
  const original = accessDraft({ email: 'sample@example.com', module_permissions: { gallery: { allowedAlbums: [4], legacyFlag: true } } });
  const draft = accessDraft(original);
  draft.module_permissions.gallery.allowedAlbums = [];
  assert.deepEqual(accessChanges(original, draft), ['Gallery: remove Album #4', 'Gallery: remove specific album restriction (not a denial of access)']);
  assert.deepEqual(original.module_permissions.gallery.allowedAlbums, [4]);
  assert.equal(draft.module_permissions.gallery.legacyFlag, true);
});

test('album lookup selects only titles and identifiers and propagates errors', async () => {
  const query = { select(fields) { assert.equal(fields, 'id,title'); return this; }, order(field) { assert.equal(field, 'id'); return this; }, range() { return Promise.resolve({ data: null, error: new Error('denied') }); } };
  await assert.rejects(loadAccessAlbums({ from(table) { assert.equal(table, 'albums'); return query; } }), /denied/);
});

test('permission directory uses the email primary key and paginates without an id column', async () => {
  const records = ['a@example.com', 'b@example.com'].map(email => ({ email, role: 'custom', allowed_tabs: [], module_permissions: {} }));
  const offsets = [];
  const client = { from(table) {
    let start = 0;
    return {
      select(fields) {
        if (table === 'admin_sidebar_permissions') assert.deepEqual(fields.split(','), ['email', 'role', 'allowed_tabs', 'module_permissions', 'created_at']);
        return this;
      },
      order(field) { assert.equal(field, table === 'admin_sidebar_permissions' ? 'email' : 'id'); return this; },
      in() { return this; },
      range(offset) { start = offset; return this; },
      then(resolve) {
        if (table === 'admin_sidebar_permissions') offsets.push(start);
        return Promise.resolve({ data: table === 'admin_sidebar_permissions' ? records.slice(start, start + 1) : [], error: null }).then(resolve);
      },
    };
  } };
  const result = await loadAccessDirectory(client);
  assert.deepEqual(result.map(row => row.email), records.map(row => row.email));
  assert.deepEqual(offsets, [0, 1, 2]);
});

test('access management requires its own grant', () => {
  for (const permissions of [null, {}, { allowed_tabs: ['event-mgmt', 'settings'] }, { orgs: [{ id: 1 }] }]) assert.ok(!canManageAccess(permissions));
  assert.ok(canManageAccess({ role: 'super_admin' }));
  assert.ok(canManageAccess({ allowed_tabs: ['admin-mgmt'] }));
});
test('editing a draft preserves the source and unknown granular grants', () => {
  const record = { email: 'USER@example.com', role: 'custom', allowed_tabs: ['players'], module_permissions: { gallery: { allowedAlbums: [4] }, finance: { allowedEvents: [9] } } };
  const original = accessDraft(record), draft = accessDraft(record);
  draft.allowed_tabs.push('calendar');
  draft.module_permissions.finance.allowedEvents.push(10);
  assert.deepEqual(record.allowed_tabs, ['players']);
  assert.deepEqual(record.module_permissions.finance.allowedEvents, [9]);
  assert.deepEqual(draft.module_permissions.gallery, { allowedAlbums: [4] });
  assert.deepEqual(accessChanges(original, draft), ['Grant direct access: Calendar', 'Finance: add Event #10']);
});

test('review ignores order and numeric/string ID differences', () => {
  const original = accessDraft({ email: 'sample@example.com', module_permissions: { gallery: { allowedAlbums: [1, 2] }, finance: { allowedEvents: [3, 4] } } });
  const draft = accessDraft(original);
  draft.module_permissions.gallery.allowedAlbums = ['2', '1'];
  draft.module_permissions.finance.allowedEvents = ['4', '3'];
  assert.deepEqual(accessChanges(original, draft), []);
});

test('review identifies event substitutions and warns when restrictions are cleared', () => {
  const original = accessDraft({ email: 'sample@example.com', module_permissions: { 'event-mgmt': { allowedEvents: [1] } } });
  const draft = accessDraft(original);
  draft.module_permissions['event-mgmt'].allowedEvents = [2];
  assert.deepEqual(accessChanges(original, draft, { events: [{ id: 2, event_name: 'Sample Cup' }] }), ['Event Manager: add Sample Cup (Event #2)', 'Event Manager: remove Event #1']);
  draft.module_permissions['event-mgmt'].allowedEvents = [];
  assert.match(accessChanges(original, draft).at(-1), /default rules apply, not a denial/);
});
test('short user search does not query the database', async () => {
  assert.deepEqual(await searchAccessUsers({}, 'ab'), []);
});
test('search escapes wildcard characters and uses one filter, not raw OR syntax', async () => {
  const calls = [];
  const query = { select() { return this; }, ilike(...args) { calls.push(args); return this; }, order() { return this; }, limit() { return this; }, abortSignal() { return Promise.resolve({ data: [], error: null }); } };
  await searchAccessUsers({ from: () => query }, 'a_%@example.com');
  assert.deepEqual(calls, [['email', '%a\\_\\%@example.com%']]);
});
