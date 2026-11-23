import assert from 'node:assert/strict';
import test from 'node:test';
import { loadEventAdvancedSnapshot, verifyEventAdvancedAccess } from '../src/pages/admin-preview/eventAdvancedGuard.js';
import { reviewedWeeklyMembers, scopeWeeklyOccurrence, verifyWeeklyOwnerUnchanged } from '../src/utils/calendarWeeklySeries.js';
import { canReviewCalendarWeeklySeries, loadCalendarWeeklySeries, saveCalendarWeeklyVisibility } from '../src/pages/admin-preview/calendarWeeklySeriesActions.js';

const event = { id: 11, is_weekly: true, is_manual: true, series_id: 'sample-series', event_name: 'Week 1', start_date: '2035-03-09', is_visible: false,
  organisation_id: 'host-org', club_id: 'host-club', registration_access: 'public', event_status: 'active' };
const sibling = { ...event, id: 12, event_name: 'Week 2', start_date: '2035-03-16' };
const review = { source_id: 11, series_id: event.series_id, occurrences: [event, sibling].map(row => ({
  id: row.id, event_name: row.event_name, start_date: row.start_date, organisation_id: row.organisation_id, club_id: row.club_id,
  unlinked_organiser: null, is_visible: row.is_visible, event_status: row.event_status,
})) };
const operation = { expectedUserId: 'admin', scopeId: 'all', isCurrent: () => true };
const mockClient = ({ active = true, admin = true, user = 'admin', current = review, response } = {}) => {
  const calls = [];
  return { calls, auth: { getUser: async () => ({ data: { user: { id: user, email: 'admin@example.invalid' } } }) },
    rpc: async (name, args) => {
      calls.push([name, args]);
      if (name === 'account_is_active') return { data: active };
      if (name === 'is_super_admin') return { data: admin };
      if (args.p_expected) return response || { data: { source_id: args.p_event_id, series_id: current.series_id, updated_count: current.occurrences.length, is_visible: args.p_visible } };
      return { data: current };
    },
  };
};

test('weekly edits bind the sorted review exclusively to the original series, organisation and club', () => {
  assert.deepEqual(reviewedWeeklyMembers(event, [sibling, event], { editable: true }), [event, sibling]);
  assert.throws(() => reviewedWeeklyMembers(event, [sibling]), /changed/);
  assert.throws(() => reviewedWeeklyMembers(event, [event, event]), /different organisers/);
  for (const changed of [{ is_manual: false }, { club_id: 'other' }, { organisation_id: 'other' }, { series_id: 'other' }]) {
    assert.throws(() => reviewedWeeklyMembers(event, [event, { ...sibling, ...changed }]), /different organisers/);
  }
  const unlinked = row => ({ ...row, organisation_id: null, club_id: null, organiser_email: ' Host@Example.invalid ' });
  assert.deepEqual(reviewedWeeklyMembers(unlinked(event), [unlinked(event), { ...unlinked(sibling), organiser_email: 'host@example.invalid' }]).map(row => row.id), [11, 12]);
  assert.throws(() => reviewedWeeklyMembers(unlinked(event), [unlinked(event), { ...unlinked(sibling), organiser_email: 'other@example.invalid' }]), /different organisers/);
  const missingHost = { ...unlinked(event), organiser_email: null };
  assert.throws(() => reviewedWeeklyMembers(missingHost, [missingHost]), /organiser .* could not be verified/);
  assert.throws(() => reviewedWeeklyMembers(event, [event, { ...sibling, event_status: 'cancelled' }], { editable: true }), /cancelled/);
  assert.throws(() => verifyWeeklyOwnerUnchanged(event, { organisation_id: null }), /cannot change/);
  assert.throws(() => verifyWeeklyOwnerUnchanged(event, { club_id: 'other' }), /cannot change/);
  assert.doesNotThrow(() => verifyWeeklyOwnerUnchanged(event, { organisation_id: event.organisation_id, event_name: 'New title' }));
});

test('each occurrence read and mutation includes reviewed status and tenant predicates', () => {
  const filters = [];
  const query = { eq: (...args) => { filters.push(['eq', ...args]); return query; }, is: (...args) => { filters.push(['is', ...args]); return query; } };
  assert.equal(scopeWeeklyOccurrence(query, { ...event, organisation_id: null, club_id: null, organiser_email: 'host@example.invalid' }), query);
  assert.deepEqual(filters, [
    ['eq', 'id', 11], ['eq', 'is_manual', true], ['eq', 'is_weekly', true], ['eq', 'series_id', 'sample-series'],
    ['is', 'organisation_id', null], ['is', 'club_id', null], ['eq', 'event_status', 'active'],
    ['eq', 'event_name', 'Week 1'], ['eq', 'start_date', '2035-03-09'], ['is', 'slug', null],
    ['eq', 'organiser_email', 'host@example.invalid'], ['is', 'organiser_name', null],
  ]);
});

test('weekly Calendar visibility requires a current platform actor and sends only the exact review', async () => {
  const client = mockClient();
  assert.equal(canReviewCalendarWeeklySeries(event, false), false);
  assert.equal(canReviewCalendarWeeklySeries({ ...event, id: 'demo-test' }, true), false);
  await assert.rejects(loadCalendarWeeklySeries({ client, event, ...operation, scopeId: 'org:host-org' }), /all-workspaces/);
  assert.equal(client.calls.length, 0);
  await assert.rejects(loadCalendarWeeklySeries({ client: mockClient({ active: false }), event, ...operation }), /super-admin/);
  await assert.rejects(loadCalendarWeeklySeries({ client: mockClient({ user: 'other' }), event, ...operation }), /Sign in again/);
  const preview = await loadCalendarWeeklySeries({ client, event, ...operation });
  assert.deepEqual(client.calls.at(-1), ['admin_calendar_weekly_series_visibility', { p_event_id: 11 }]);
  let attempts = 0;
  const result = await saveCalendarWeeklyVisibility({ client, event, review: preview, visible: true, ...operation, onAttempt: () => attempts++ });
  assert.deepEqual(client.calls.at(-1), ['admin_calendar_weekly_series_visibility', { p_event_id: 11, p_expected: review.occurrences, p_visible: true }]);
  assert.equal(result.updated_count, 2);
  assert.equal(attempts, 1);
});

test('a replaced host, stale review, incomplete receipt or removed permissions fail closed', async () => {
  const changed = { ...review, occurrences: [{ ...review.occurrences[0], club_id: 'other' }, review.occurrences[1]] };
  await assert.rejects(loadCalendarWeeklySeries({ client: mockClient({ current: changed }), event, ...operation }), /changed/);
  const onAttempt = () => {};
  const base = { event, review, visible: true, ...operation, onAttempt };
  await assert.rejects(saveCalendarWeeklyVisibility({ ...base, client: mockClient({ admin: false }) }), /super-admin/);
  await assert.rejects(saveCalendarWeeklyVisibility({ ...base, client: mockClient({ response: { error: new Error('The weekly series changed after review') } }) }), /changed after review/);
  await assert.rejects(saveCalendarWeeklyVisibility({ ...base, client: mockClient({ response: { data: { ...review, updated_count: 1, is_visible: true } } }) }), /every reviewed week/);
});


test('the editor preflight authorizes before loading siblings and rejects concurrent settings or membership changes', async () => {
  const rows = [event, sibling];
  const reads = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'admin', email: 'admin@example.invalid' } } }) },
    from(table) {
      let list = table === 'calendar' ? rows : table === 'admin_sidebar_permissions' ? [{ role: 'super_admin', email: 'admin@example.invalid' }] : [];
      reads.push(table);
      const query = {
        select() { return query; },
        eq(key, value) { list = list.filter(row => row[key] === value); return query; },
        order() { return query; },
        async range() { return { data: list }; },
        async single() { return { data: list[0] }; },
        async maybeSingle() { return query.single(); },
      };
      return query;
    },
  };
  await assert.rejects(loadEventAdvancedSnapshot(client, 11, async () => { throw new Error('Actor revoked'); }), /Actor revoked/);
  assert.deepEqual(reads, ['calendar']);
  const snapshot = await loadEventAdvancedSnapshot(client, 11);
  const verify = () => verifyEventAdvancedAccess({
    client, original: snapshot.event, divisions: snapshot.divisions, siblings: snapshot.siblings, expectedUserId: 'admin',
  });
  assert.deepEqual((await verify()).siblings.map(row => row.id), [11, 12]);
  rows[1] = { ...sibling, weekly_payment_policy: 'allow_reserve' };
  await assert.rejects(verify(), /Weekly series changed since opening/);
  rows[1] = { ...sibling, organisation_id: 'other-org' };
  await assert.rejects(verify(), /different organisers/);
});
