import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSoloTeam } from '../../src/pages/admin-preview/soloEntries.js';
test('solo entries exclude linked teams and recorded partners', () => {
  assert.equal(isSoloTeam([]), false);
  assert.equal(isSoloTeam([{ id: 1 }]), true);
  assert.equal(isSoloTeam([{ partner_name: '  ', partner_email: '' }]), true);
  assert.equal(isSoloTeam([{ partner_name: 'Partner' }]), false);
  assert.equal(isSoloTeam([{ partner_email: 'partner@example.com' }]), false);
  assert.equal(isSoloTeam([{ id: 1 }, { id: 2 }]), false);
});
