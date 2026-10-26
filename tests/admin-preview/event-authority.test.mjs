import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyEventOperationAccess } from '../../src/pages/admin-preview/eventOperationAccess.js';
import { hydrateEventLicenses, eventLicenseCategory } from '../../src/pages/admin-preview/eventLicenseData.js';
import { readTournamentAssignments } from '../../src/utils/tournamentAccess.js';
import { resolveRegistrationLicenseCategory } from '../../src/utils/registrationLicense.js';

function authorityClient({ actor = 'actor', event = { id: 7, organisation_id: 4 }, allowed = true } = {}) {
  const calls = [];
  return { calls, auth: { getUser: async () => ({ data: { user: { id: actor, email: 'admin@example.test' } } }) },
    from(table) { calls.push(table); const q = { select() { return q; }, eq() { return q; }, single: async () => ({ data: event }) }; return q; },
    rpc: async (name, args) => { calls.push([name, args]); return { data: allowed }; } };
}
test('event operation checks current actor, selected scope and deployed server authority', async () => {
  const client = authorityClient();
  const result = await verifyEventOperationAccess({ client, eventId: 7, expectedUserId: 'actor', scopeId: 'org:4' });
  assert.equal(result.event.id, 7);
  assert.deepEqual(client.calls[1], ['can_manage_event', { p_event_id: 7 }]);
  for (const [options, message] of [[{ expectedUserId: 'changed' }, /account changed/], [{ scopeId: 'org:5' }, /outside/]]) {
    await assert.rejects(verifyEventOperationAccess({ client, eventId: 7, expectedUserId: 'actor', ...options }), message);
  }
  await assert.rejects(verifyEventOperationAccess({ client: authorityClient({ allowed: false }), eventId: 7, expectedUserId: 'actor' }), /authority/);
});
test('invalid or cancelled event operations do not read any data', async () => {
  const client = authorityClient();
  await assert.rejects(verifyEventOperationAccess({ client, eventId: 'preview', expectedUserId: 'actor' }), /saved event/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(verifyEventOperationAccess({ client, eventId: 7, expectedUserId: 'actor', signal: controller.signal }), { name: 'AbortError' });
  assert.equal(client.calls.length, 0);
});
test('event licence coverage overrides stale current projections and historical payment metadata', async () => {
  const original = { id: 12, license_type: 'full', paid_registration: true };
  const client = { rpc: async (name, args) => {
    assert.equal(name, 'event_license_status'); assert.deepEqual(args, { p_event_id: 7, p_player_ids: [12] });
    return { data: [{ player_id: 12, eligibility: { year: 2026, full: false, temporary: false } }] };
  } };
  const [player] = await hydrateEventLicenses(client, [original], 7);
  assert.equal(player.license_type, 'none'); assert.equal(original.license_type, 'full');
  assert.equal(resolveRegistrationLicenseCategory('person@example.test', 7, player, [{ metadata: { covers: [{ type: 'license', email: 'person@example.test', license: 'full' }] } }]), 'none');
});
test('incomplete or malformed event licence responses fail visibly instead of assuming no licence', async () => {
  for (const data of [[], null, [{ player_id: 12, eligibility: {} }], [{ player_id: 99, eligibility: { full: false, temporary: false } }]]) {
    await assert.rejects(hydrateEventLicenses({ rpc: async () => ({ data }) }, [{ id: 12 }], 7), /eligibility/);
  }
  await assert.rejects(hydrateEventLicenses({}, [{ id: 'invalid', license_type: 'full' }], 7), /valid player identity/);
  assert.throws(() => eventLicenseCategory({ event_license: { event_id: 7, full: 'false', temporary: false } }, 7), /unexpected/);
});
test('event licence hydration batches at500 and deduplicates players', async () => {
  const batches = [];
  const client = { rpc: async (_name, args) => { batches.push(args.p_player_ids); return { data: args.p_player_ids.map(player_id => ({ player_id, eligibility: { full: false, temporary: true } })) }; } };
  const players = Array.from({ length: 501 }, (_, i) => ({ id: i + 1 }));
  const result = await hydrateEventLicenses(client, [...players, players[0]], 7);
  assert.deepEqual(batches.map(batch => batch.length), [500, 1]); assert.equal(result.length, 502); assert.equal(result[0].license_type, 'temporary');
});
test('tournament sidebar grants never substitute for current user assignment RPC', async () => {
  const client = authorityClient(); client.rpc = async name => { assert.equal(name, 'tm_list_events'); return { data: [{ id: 7, can_prepare: true }] }; };
  assert.equal((await readTournamentAssignments(client, ' Admin@Example.Test ')).length, 1);
  await assert.rejects(readTournamentAssignments(client, 'other@example.test'), /account changed/);
  client.rpc = async () => ({ error: new Error('denied') });
  await assert.rejects(readTournamentAssignments(client, 'admin@example.test'), /denied/);
});
