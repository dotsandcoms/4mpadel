import test from 'node:test';
import assert from 'node:assert/strict';
import { canReadClubDirectory, loadClubDirectory, filterClubDirectory, clubStatusLabel, clubDirectorySummary } from '../../src/pages/admin-preview/clubsData.js';
const session = { user: { id: 'qa' } }, permissions = { role: 'super_admin' };
test('club directory denies unsigned, delegated and workspace-only access', async () => {
  const client = { from() { throw Error('Must not query'); } };
  assert.equal(canReadClubDirectory(null, permissions, 'all'), false);
  for (const [p, scope] of [[{ role: 'custom', allowed_tabs: ['clubs'] }, 'all'], [permissions, 'club:1']]) {
    await assert.rejects(loadClubDirectory(client, session, p, scope), /Platform Clubs/);
  }
});
test('directory reads every accessible page with minimal columns and progress', async () => {
  const progress = [];
  const client = { from(table) {
    assert.equal(table, 'clubs'); let start;
    return { select(columns) { assert.ok(!columns.includes('*')); assert.ok(!/email|phone|contacts|members/.test(columns)); return this; },
      order(column) { assert.equal(column, 'id'); return this; }, range(a) { start = a; return this; },
      then(resolve) { return Promise.resolve({ data: start < 3 ? [{ id: start, name: `Club ${start}` }] : [] }).then(resolve); } };
  } };
  const rows = await loadClubDirectory(client, session, permissions, 'all', undefined, count => progress.push(count));
  assert.equal(rows.length, 3); assert.deepEqual(progress, [0, 1, 2, 3]);
});
test('club lifecycle, verification and SAPA registration remain distinct', () => {
  const rows = [{ id: 1, name: 'Zulu', status: 'in_review', verified: false, sapa_registered: true },
    { id: 2, name: 'Alpha', status: '4m_approved', verified: true, sapa_registered: false, province: 'Gauteng' },
    { id: 3, name: 'Beta', status: 'pending', verified: null }];
  assert.deepEqual(clubDirectorySummary(rows), { total: 3, verified: 1, inReview: 2, sapaRegistered: 1 });
  assert.deepEqual(filterClubDirectory(rows, { query: 'GAUTENG', verification: 'verified' }).map(row => row.id), [2]);
  assert.deepEqual(filterClubDirectory(rows, { verification: 'unverified' }).map(row => row.id), [1]);
  assert.equal(rows[0].name, 'Zulu');
  assert.equal(clubStatusLabel('4m_approved'), '4M approved');
  assert.match(clubStatusLabel('new_status'), /Unknown status/);
});
test('club errors and cancellation are never disguised as empty results', async () => {
  await assert.rejects(loadClubDirectory({ from() { throw Error('Database unavailable'); } }, session, permissions, 'all'), /Database unavailable/);
  await assert.rejects(loadClubDirectory({ from() { throw Error('Should not query'); } }, session, permissions, 'all', AbortSignal.abort()), /abort/i);
});
