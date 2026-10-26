import test from 'node:test';
import assert from 'node:assert/strict';
import { eventContinuation } from '../../src/pages/admin-preview/eventContinuation.js';

test('continuation freshly checks actor between writes and rejects an account switch', async () => {
  let user = { id: 'first' }, reads = 0;
  const token = {}, writes = [], client = { auth: { getUser: async () => { reads++; return { data: { user } }; } } };
  const verify = eventContinuation({ client, actorId: 'first', token, getCurrent: () => token });
  await verify(); writes.push('calendar'); user = { id: 'second' };
  await assert.rejects(verify(), /account changed/);
  assert.deepEqual(writes, ['calendar']); assert.equal(reads, 2);
});
test('unmount and identical A-B-A contexts cannot revive an old continuation', async () => {
  const token = { eventId: 1 }, client = { auth: { getUser: async () => ({ data: { user: { id: 'first' } } }) } };
  let current = token;
  const verify = eventContinuation({ client, actorId: 'first', token, getCurrent: () => current });
  await verify(); current = null; await assert.rejects(verify(), /context changed/);
  current = { eventId: 1 }; await assert.rejects(verify(), /context changed/);
});
test('context change while fresh authentication is in flight blocks the following write', async () => {
  let finish; const token = {}; let current = token;
  const client = { auth: { getUser: () => new Promise(resolve => { finish = resolve; }) } };
  const pending = eventContinuation({ client, actorId: 'first', token, getCurrent: () => current })();
  current = {}; finish({ data: { user: { id: 'first' } } });
  await assert.rejects(pending, /context changed/);
});
