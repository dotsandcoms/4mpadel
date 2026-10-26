import test from 'node:test';
import assert from 'node:assert/strict';
import { canReadPreviewEvents, restrictPreviewEvents, previewScopes } from '../../src/pages/admin-preview/access.js';

const query = () => ({ calls: [], in(...args) { this.calls.push(['in', ...args]); return this; }, eq(...args) { this.calls.push(['eq', ...args]); return this; } });

test('missing permissions and unrelated memberships cannot load event data', () => {
  for (const permissions of [null, {}, { allowed_tabs: ['players'] }, { orgs: [{ id: 1 }] }, { clubs: [{ id: 2 }] }]) {
    assert.ok(!canReadPreviewEvents(permissions));
    assert.throws(() => restrictPreviewEvents(query(), permissions), /access is required/);
  }
});

test('event assignments remain restrictive even with a module tab grant', () => {
  const result = restrictPreviewEvents(query(), { allowed_tabs: ['event-mgmt'], module_permissions: { 'event-mgmt': { allowedEvents: [463] } } }, { type: 'Club', recordId: 7 });
  assert.deepEqual(result.calls, [['in', 'id', [463]], ['eq', 'club_id', 7]]);
});

test('event-only grants and organisation selection intersect', () => {
  const permissions = { module_permissions: { 'event-mgmt': { allowedEvents: [12, 13] } } };
  assert.ok(canReadPreviewEvents(permissions));
  assert.deepEqual(restrictPreviewEvents(query(), permissions, { type: 'Organisation', recordId: 2 }).calls, [['in', 'id', [12, 13]], ['eq', 'organisation_id', 2]]);
});

test('super admin scope selection still narrows queries', () => {
  assert.deepEqual(restrictPreviewEvents(query(), { role: 'super_admin' }, { type: 'Club', recordId: 9 }).calls, [['eq', 'club_id', 9]]);
});

test('scope IDs distinguish clubs from organisations and do not claim platform access', () => {
  const scopes = previewScopes({ orgs: [{ id: 1, name: 'Org' }], clubs: [{ id: 1, name: 'Club' }] });
  assert.equal(new Set(scopes.map(scope => scope.id)).size, 3);
  assert.equal(scopes[0].label, 'My authorised access');
});
