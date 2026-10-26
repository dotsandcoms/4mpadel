import test from 'node:test';
import assert from 'node:assert/strict';
import { runRankedinSync, rankedinSyncSummary } from '../../src/pages/admin-preview/rankedinSync.js';

const event = { id: 42, is_manual: true, rankedin_url: 'https://www.rankedin.com/en/tournament/123/example' };
function fake({ fresh = event, user = { id: 'admin' }, data = { ok: true }, invokeError = null } = {}) {
  const calls = [];
  const client = {
    auth: { getUser: async () => ({ data: { user } }) },
    from: table => { assert.equal(table, 'calendar'); return { select: () => ({ eq: (key, value) => { assert.equal(key, 'id'); assert.equal(value, 42); return { maybeSingle: async () => ({ data: fresh }) }; } }) }; },
    functions: { invoke: async (...args) => { calls.push(args); return { data, error: invokeError }; } },
  };
  return { client, calls };
}
test('sync delegates existing payload and preserves server partial results', async () => {
  const data = { ok: true, writePush: { errors: ['One team failed'], pushed: 2 } };
  const { client, calls } = fake({ data });
  assert.equal(await runRankedinSync({ client, event }), data);
  assert.deepEqual(calls, [['sync-to-rankedin', { body: { eventId: 42, rankedinId: '123' } }]]);
  assert.equal(rankedinSyncSummary(data).needsReview, true);
});
test('unauthenticated and changed tournament links cannot start a sync', async () => {
  for (const options of [{ user: null }, { fresh: { ...event, rankedin_id: '999' } }, { fresh: null }]) {
    const { client, calls } = fake(options);
    await assert.rejects(runRankedinSync({ client, event }));
    assert.equal(calls.length, 0);
  }
});
test('unlinked or non-manual events cannot start a sync', async () => {
  const { client, calls } = fake();
  for (const invalid of [{ ...event, is_manual: false }, { id: 42, is_manual: true }]) await assert.rejects(runRankedinSync({ client, event: invalid }));
  assert.equal(calls.length, 0);
});
test('failed and unconfirmed invocations are not reported as success', async () => {
  for (const options of [{ data: null }, { data: { ok: false, error: 'Forbidden' } }, { invokeError: new Error('Network failure') }]) {
    const { client } = fake(options);
    await assert.rejects(runRankedinSync({ client, event }));
  }
});
test('summary reports configuration, mapping, skips and both push errors', () => {
  const summary = rankedinSyncSummary({ mapping: { mapped: [1], unmatchedLocal: [{ divisionName: 'Open' }] }, writePush: { status: 'not_configured', skipped: [{ reason: 'solo_entry' }], errors: ['entry error'] }, detailsPush: { errors: ['details error'], updated: ['venue'] }, nextSteps: ['Review'] });
  assert.equal(summary.needsReview, true);
  assert.equal(summary.mapped, 1);
  assert.equal(summary.skipped.length, 1);
  assert.deepEqual(summary.errors, ['entry error', 'details error']);
  assert.deepEqual(summary.updated, ['venue']);
});
