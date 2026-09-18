import test from 'node:test';
import assert from 'node:assert/strict';
import { tournamentJourneys } from '../src/utils/proJourney.js';
const match = (id, round, event = 1) => ({ id, round, tournamentId: event, tournamentName: `Event ${event}`, playedAt: event === 1 ? '2026-09-10' : '2026-09-01', teams: [[{ id: 66 }], [{ id: 115 }]] });
test('journeys group latest event first and order rounds chronologically', () => {
  const events = tournamentJourneys([match(1, 1), match(2, 4), match(3, 2), match(4, 4, 2)], 66);
  assert.deepEqual(events.map(e => e.id), [1, 2]);
  assert.deepEqual(events[0].matches.map(m => m.round), [4, 2, 1]);
});
test('missing rounds remain missing; duplicate and unrelated matches are excluded', () => {
  const events = tournamentJourneys([match(1, 1), match(1, 1), match(2, 4)], 66);
  assert.deepEqual(events[0].matches.map(m => m.round), [4, 1]);
  assert.deepEqual(tournamentJourneys([match(1, 1)], 99), []);
});
