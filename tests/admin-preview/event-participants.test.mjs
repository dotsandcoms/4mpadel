import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readEventParticipants, participantSnapshot, participantLicence } from '../../src/pages/admin-preview/eventParticipants.js';
test('RankedIn detail uses the same participant source and count as the event snapshot', async () => {
  const rows = Array.from({ length: 49 }, (_, id) => ({ id, event_id: 7, full_name: `Player ${id}`, class_name: 'Open', is_paid: false }));
  const client = { from(table) {
    assert.equal(table, 'tournament_participants');
    let offset = 0;
    const query = { select() { return query; }, eq(field, id) { assert.equal(field, 'event_id'); assert.equal(id, 7); return query; }, order() { return query; }, range(start) { offset = start; return query; }, abortSignal() { return query; }, then(resolve) { return Promise.resolve({ data: rows.slice(offset, offset + 500), error: null }).then(resolve); } };
    return query;
  } };
  const loaded = await readEventParticipants(client, 7);
  assert.equal(participantSnapshot({ id: 7, is_manual: false }, loaded).entries, 49);
});
test('participant licence matches the existing snapshot category', () => {
  assert.equal(participantLicence({ players: { license_type: 'full' } }, 7), 'Full licence');
  assert.equal(participantLicence({ players: { temporary_licenses: [{ event_id: 7 }] } }, 7), 'Temporary licence');
  assert.equal(participantLicence({}, 7), 'No licence');
});
