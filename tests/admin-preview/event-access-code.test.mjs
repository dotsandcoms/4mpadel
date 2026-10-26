import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateAccessCode, getAccessCodeError, saveEventAccessCode } from '../../src/utils/eventAccessCode.js';

test('source access codes use secure generation and Unicode character length limits', () => {
  assert.match(generateAccessCode(), /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  for (const code of ['short', 'a'.repeat(65)]) assert.ok(getAccessCodeError({ enabled: true, code }));
  assert.equal(getAccessCodeError({ enabled: true, code: '😀'.repeat(6) }), '');
  assert.equal(getAccessCodeError({ enabled: true, code: '', protectedBefore: true }), '');
});
test('source code contract enables, replaces, preserves blank and removes protection', async () => {
  const calls = [], client = { rpc: async (...args) => { calls.push(args); return {}; } };
  await saveEventAccessCode(client, 7, { enabled: true, code: ' ABCDEF ' });
  assert.deepEqual(calls[0], ['set_event_access_code', { p_event_id: 7, p_enabled: true, p_code: 'ABCDEF' }]);
  await saveEventAccessCode(client, 7, { enabled: true, code: '', protectedBefore: true });
  assert.equal(calls.length, 1);
  await saveEventAccessCode(client, 7, { enabled: false, code: '', protectedBefore: true });
  assert.deepEqual(calls[1][1], { p_event_id: 7, p_enabled: false, p_code: null });
  await assert.rejects(saveEventAccessCode(client, 7, { enabled: true, code: 'bad' }), /6–64/);
  assert.equal(calls.length, 2);
});
test('failed access-code mutation propagates; never reports success', async () => {
  const client = { rpc: async () => ({ error: new Error('RPC denied') }) };
  await assert.rejects(saveEventAccessCode(client, 7, { enabled: true, code: 'ABCDEF' }), /RPC denied/);
});
