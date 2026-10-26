const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const moduleUnderTest = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/companion-schedule.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { module: moduleUnderTest, exports: moduleUnderTest.exports, Date });
const { companionDate, makeCompanionSchedule } = moduleUnderTest.exports;
const now = Date.parse('2026-09-18T08:00:00Z');
const base = { upcomingMatches: [], upcomingSchedule: [], pending: [] };
const event = (id, extra = {}) => ({ id, event_name: `Event ${id}`, start_date: '2026-09-19', ...extra });

test('SAST date-only events have no invented start time, RankedIn times are timezone-stable', () => {
  const d = companionDate('2026-09-19');
  assert.equal(d.time, Date.parse('2026-09-18T22:00:00Z'));
  assert.equal(d.allDay, true);
  const timed = companionDate('19/09/2026 09:30');
  assert.equal(timed.time, Date.parse('2026-09-19T07:30:00Z'));
  assert.equal(timed.allDay, false);
  assert.equal(companionDate('2026-09-19T09:30:00Z').time, Date.parse('2026-09-19T09:30:00Z'));
  assert.equal(companionDate('nonsense').time, null);
});
test('saved is not registered; payment pending requires an actual pending action', () => {
  const snapshot = makeCompanionSchedule({ ...base, upcomingSchedule: [event(1), event(2, { isRegistered: true }), event(3, { isPaid: true }), event(4, { isRegistered: true, slug: 'paris' })], pending: [{ kind: 'payment', path: '/calendar/paris' }] }, now);
  assert.deepEqual(Array.from(snapshot.items, e => e.status), ['Saved event', 'Registered', 'Entry paid', 'Payment pending']);
  assert.equal(snapshot.items[3].path, '/events/paris');
  assert.equal('email' in snapshot, false);
});
test('expired entries are removed, multi-day events remain and duplicate matches appear once', () => {
  const match = { Info: { EventName: 'Match', Date: '19/09/2026 09:30', Court: 'Court 2', Challenger: { Name: 'A' }, Challenged: { Name: 'B' } } };
  const snapshot = makeCompanionSchedule({ ...base, upcomingSchedule: [event(1, { start_date: '2026-09-16' }), event(2, { start_date: '2026-09-16', end_date: '2026-09-20' })], upcomingMatches: [match, match] }, now);
  assert.equal(snapshot.items.length, 2);
  assert.equal(snapshot.items[0].id, 'event-2');
  assert.equal(snapshot.items[1].court, 'Court 2');
  assert.equal(snapshot.items[1].subtitle, 'A vs B');
});
test('payload is bounded, chronological and contains an explicit empty state', () => {
  const snapshot = makeCompanionSchedule({ ...base, upcomingSchedule: Array.from({ length: 15 }, (_, i) => event(i)) }, now);
  assert.equal(snapshot.items.length, 10);
  const empty = makeCompanionSchedule(base, now);
  assert.equal(empty.items.length, 0);
  assert.equal(empty.signedIn, true);
  assert.equal(empty.version, 1);
});
test('a busy match schedule does not crowd upcoming events out of the Watch', () => {
  const snapshot = makeCompanionSchedule({ ...base,
    upcomingMatches: Array.from({ length: 15 }, (_, i) => ({ Info: { EventName: `Match ${i}`, Date: '19/09/2026 09:30' } })),
    upcomingSchedule: [event(1, { start_date: '2026-09-25' })],
  }, now);
  assert.equal(snapshot.items.filter(item => item.kind === 'match').length, 10);
  assert.equal(snapshot.items.filter(item => item.kind === 'event').length, 1);
  assert.equal(snapshot.items.at(-1).title, 'Event 1');
});
