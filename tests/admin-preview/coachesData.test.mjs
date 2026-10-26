import test from 'node:test';
import assert from 'node:assert/strict';
import { canReadCoaches, loadCoaches, filterCoaches, coachLink } from '../../src/pages/admin-preview/coachesData.js';
import { mockReadClient } from './playersTestData.mjs';
const session = { user: { id: 'qa' } }, permission = { role: 'super_admin' };
test('coaches requires a real session, platform scope and explicit module access', async () => {
  assert.equal(canReadCoaches(session, { allowed_tabs: ['coaches'] }, 'all'), true);
  for (const args of [[null, permission, 'all'], [session, {}, 'all'], [session, permission, 'org:1']]) {
    const client = mockReadClient();
    await assert.rejects(loadCoaches(client, ...args), /access/);
    assert.equal(client.calls.length, 0);
  }
});
test('coaches reads all pages and propagates failures', async () => {
  const rows = Array.from({ length: 105 }, (_, id) => ({ id, created_at: '2026-09-22' }));
  const result = await loadCoaches(mockReadClient({ coach_applications: rows }, { cap: 20 }), session, permission, 'all');
  assert.equal(result.length, 105);
  await assert.rejects(loadCoaches(mockReadClient({}, { errors: { coach_applications: 'denied' } }), session, permission, 'all'), /denied/);
});
test('source filters combine safely for incomplete application records', () => {
  const rows = [{ full_name: 'Alex Test', email: 'A@EXAMPLE.TEST', status: 'approved', gender: 'Male' }, { full_name: null, email: null, status: 'pending' }];
  assert.equal(filterCoaches(rows, { query: ' a@example ', status: 'approved', gender: 'Male' }).length, 1);
  assert.equal(filterCoaches(rows, { query: 'alex', status: 'pending' }).length, 0);
  assert.equal(filterCoaches(rows).length, 2);
});
test('profile links allow only complete web URLs', () => {
  assert.equal(coachLink('https://example.test/profile'), 'https://example.test/profile');
  for (const url of ['javascript:alert(1)', 'data:text/html,test', '//example.test', 'file:///tmp/test', null]) assert.equal(coachLink(url), null);
});
