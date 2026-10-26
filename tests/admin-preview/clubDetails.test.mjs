import test from 'node:test';
import assert from 'node:assert/strict';
import { loadClubDetails, recordedText, safeClubWebsite } from '../../src/pages/admin-preview/clubDetailsData.js';
const session = { user: { id: 'qa' } }, permissions = { role: 'super_admin' };
test('club profiles require platform authority and an exact club read', async () => {
  const client = { from(table) { assert.equal(table, 'clubs'); return { select(cols) { assert.ok(!cols.includes('*')); return this; }, eq(key, id) { assert.equal(key, 'id'); assert.equal(id, 'one'); return this; }, abortSignal() { return this; }, maybeSingle() { return { data: { id: 'one' } }; } }; } };
  assert.equal((await loadClubDetails(client, session, permissions, 'all', 'one')).id, 'one');
  await assert.rejects(loadClubDetails(client, session, { role: 'custom' }, 'all', 'one'), /Platform/);
  await assert.rejects(loadClubDetails(client, session, permissions, 'club:one', 'one'), /Platform/);
  await assert.rejects(loadClubDetails(client, session, permissions, 'all', 'one', AbortSignal.abort()), /abort/i);
});
test('club missing/error records and unsafe URLs are handled explicitly', async () => {
  const client = result => ({ from() { return { select() { return this; }, eq() { return this; }, abortSignal() { return this; }, maybeSingle() { return result; } }; } });
  await assert.rejects(loadClubDetails(client({ data: null }), session, permissions, 'all', 'one'), /no longer available/);
  await assert.rejects(loadClubDetails(client({ error: { message: 'Denied' } }), session, permissions, 'all', 'one'), /Denied/);
  assert.equal(recordedText(0), '0'); assert.equal(recordedText(null), 'Not recorded');
  assert.equal(safeClubWebsite('javascript:alert(1)'), null);
  assert.equal(safeClubWebsite('https://example.com'), 'https://example.com/');
});
