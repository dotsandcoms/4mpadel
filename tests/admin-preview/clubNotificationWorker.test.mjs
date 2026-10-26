import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateClubNotification, allowClubNotificationSimulation } from '../../supabase/functions/_shared/clubNotificationWorker.js';
const job = { id: 'qa-id', attempt_token: 'qa-token', recipient: 'qa@example.invalid', template: 'club_approved', payload: { clubName: 'QA' } };
function mock(record = job, failed = false) {
  const calls = [];
  return { calls, async rpc(name, args) { calls.push({ name, args }); return name.includes('claim_') ? { data: record } : failed ? { error: new Error('Lost acknowledgement') } : { data: { delivery_status: args.p_outcome } }; } };
}
test('worker gate permits only exact service identity, staging host and simulation mode', () => {
  const valid = { url: 'https://cefmzkwabdqqoagxhekc.supabase.co', mode: 'simulate', authorization: 'Bearer secret', serviceKey: 'secret' };
  assert.equal(allowClubNotificationSimulation(valid), null);
  for (const patch of [{ authorization: '' }, { serviceKey: '' }, { authorization: 'Bearer user' }, { mode: 'live' }, { url: 'https://uzglrpbixubfijvjbtgz.supabase.co' }, { url: valid.url + '.evil.test' }]) assert(allowClubNotificationSimulation({ ...valid, ...patch }));
});
test('simulation reserves only synthetic jobs and never calls a provider', async () => {
  const client = mock(); let rendered = 0;
  const result = await simulateClubNotification({ client, kind: 'application', render: () => { rendered++; return { subject: 'QA', html: '<p>QA</p>' }; } });
  assert.equal(result.status, 'simulated'); assert.equal(rendered, 1);
  assert.equal(client.calls[0].args.p_synthetic_only, true);
  assert.equal(client.calls[1].args.p_attempt_token, job.attempt_token);
  assert.equal(client.calls[1].args.p_outcome, 'simulated');
});
test('empty queue performs no finish', async () => {
  const client = mock(null); assert.deepEqual(await simulateClubNotification({ client, kind: 'claim', render() { throw new Error('Unexpected'); } }), { status: 'empty' }); assert.equal(client.calls.length, 1);
});
test('unexpected recipient or template fails without rendering', async () => {
  for (const patch of [{ recipient: 'real@example.com' }, { template: 'broadcast' }, { recipient: 'two@example.invalid,real@example.com' }]) {
    const client = mock({ ...job, ...patch });
    assert.equal((await simulateClubNotification({ client, kind: 'application', render() { assert.fail('No render'); } })).status, 'failed');
  }
});
test('acknowledgement failure is not retried', async () => {
  const client = mock(job, true);
  await assert.rejects(simulateClubNotification({ client, kind: 'application', render: () => ({ subject: 'QA', html: 'QA' }) }), /Reconcile/);
  assert.equal(client.calls.length, 2);
});
