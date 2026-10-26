import test from 'node:test';
import assert from 'node:assert/strict';
import { EVENT_ACTIONS, presetActions, checkProposedEventAction, actionPolicyChanges } from '../../src/pages/admin-preview/eventActionPolicy.js';

const restricted = { role: 'custom', allowed_tabs: ['event-mgmt'], module_permissions: { 'event-mgmt': { allowedEvents: [1] } } };
test('action allow cannot extend assigned event scope', () => {
  assert.equal(checkProposedEventAction(restricted, { 'event.edit': 'allow' }, 2, 'event.edit').status, 'blocked');
  assert.equal(checkProposedEventAction(restricted, { 'event.edit': 'allow' }, '1', 'event.edit').status, 'proposed');
});
test('view-only preset blocks every inventoried write operation', () => {
  const policy = presetActions('viewer');
  assert.equal(Object.keys(policy).length, EVENT_ACTIONS.length);
  assert.ok(Object.values(policy).every(value => value === 'deny'));
});
test('event manager preset leaves publishing, financial and irreversible actions separate', () => {
  const policy = presetActions('event-manager');
  assert.equal(policy['event.edit'], 'allow');
  for (const id of ['event.publish', 'event.delete', 'payments.mark', 'draw.publish', 'rankings.award']) assert.equal(policy[id], 'deny');
});
test('existing rules are unknown rather than assumed allowed', () => {
  assert.equal(checkProposedEventAction(restricted, {}, 1, 'match.score').status, 'unknown');
  assert.deepEqual(actionPolicyChanges({ 'match.score': 'existing' }), []);
});
test('no direct event grant cannot be expanded by an action preset', () => {
  assert.equal(checkProposedEventAction({ allowed_tabs: ['players'] }, presetActions('event-manager'), 1, 'event.edit').status, 'blocked');
});
test('unknown actions fail closed and super-admin override is explicit', () => {
  assert.equal(checkProposedEventAction({ role: 'super_admin' }, {}, 1, 'unknown').status, 'blocked');
  assert.equal(checkProposedEventAction({ role: 'super_admin' }, presetActions('viewer'), 1, 'event.edit').status, 'override');
  assert.throws(() => presetActions('unknown'));
});
