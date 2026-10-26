import test from 'node:test';
import assert from 'node:assert/strict';
import { eventDetailsPatch, divisionDetailsPatch, newDivisionRecord, loadEventDetails, saveEventDetails } from '../../src/pages/admin-preview/saveEventDetails.js';
import { eventEditorDraft } from '../../src/pages/admin-preview/eventEditorFields.js';

const event = { id: 25, event_name: 'Open', organiser_email: 'club@example.test', organiser_phone: '', contact_details: 'Jo', organiser_name: 'Club', organiser_website: '', is_weekly: false, series_id: null, pending_changes: null, pending_changes_status: null };
function fake({ role = 'super_admin', fresh = event, freshDivision = null, currentDivisions = [], written = { id: 25 }, writeError = null } = {}) {
  const calls = [];
  return { calls, auth: { getUser: async () => ({ data: { user: { email: 'admin@example.test' } } }) }, from(table) {
    const state = { table, filters: [] }; calls.push(state);
    const query = {
      select() { return query; }, update(payload) { state.payload = payload; return query; }, insert(payload) { state.payload = payload; state.insert = true; return query; }, order() { return query; },
      eq(...args) { state.filters.push(['eq', ...args]); return query; }, is(...args) { state.filters.push(['is', ...args]); return query; },
      single: async () => ({ data: table === 'tournament_divisions' ? freshDivision : fresh }), maybeSingle: async () => table === 'admin_sidebar_permissions' ? { data: { role } } : { data: written, error: writeError },
      then(resolve) { return Promise.resolve({ data: state.insert ? state.payload.map((_, index) => ({ id: index + 60 })) : currentDivisions, error: writeError }).then(resolve); },
    }; return query;
  } };
}
test('setup patch contains known changed fields but never silently publishes', () => {
  assert.deepEqual(eventDetailsPatch(event, { ...event, event_name: 'New open', entry_fee: 0, is_visible: true }), { event_name: 'New open', entry_fee: 0 });
});
test('opening details loads the full source record without writing', async () => {
  const client = fake();
  assert.deepEqual(await loadEventDetails({ client, event: { id: event.id } }), event);
  assert.equal(client.calls.filter(call => call.payload).length, 0);
});
test('weekly and amendment events cannot bypass their source workflows', () => {
  assert.throws(() => eventDetailsPatch({ ...event, is_weekly: true }, event), /Weekly/);
  assert.throws(() => eventDetailsPatch({ ...event, pending_changes_status: 'pending' }, event), /amendment/);
});
test('existing contact-channel requirement and event name remain enforced', () => {
  assert.throws(() => eventDetailsPatch(event, { ...event, event_name: ' ' }), /name is required/);
  assert.throws(() => eventDetailsPatch(event, { ...event, organiser_email: '' }), /phone or email/);
});
test('save verifies auth and fresh source and writes only selected details with compare guards', async () => {
  const client = fake();
  assert.deepEqual(await saveEventDetails({ client, event, draft: { ...event, event_name: 'Updated' } }), { changed: true });
  const writes = client.calls.filter(call => call.payload);
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].payload, { event_name: 'Updated' });
  assert.ok(writes[0].filters.some(filter => filter[1] === 'event_name' && filter[2] === 'Open'));
  assert.ok(writes[0].filters.some(filter => filter[0] === 'is' && filter[1] === 'pending_changes'));
});
test('denied, stale and newly weekly records never write', async () => {
  for (const options of [{ role: 'event_admin' }, { fresh: { ...event, event_name: 'Changed' } }, { fresh: { ...event, is_weekly: true } }]) {
    const client = fake(options);
    await assert.rejects(saveEventDetails({ client, event, draft: { ...event, event_name: 'Updated' } }));
    assert.equal(client.calls.filter(call => call.payload).length, 0);
  }
});
test('zero-row conflict and failed update are not reported as success; unchanged drafts do not query', async () => {
  for (const options of [{ written: null }, { writeError: { message: 'failed' } }]) await assert.rejects(saveEventDetails({ client: fake(options), event, draft: { ...event, event_name: 'Updated' } }));
  const client = fake();
  assert.deepEqual(await saveEventDetails({ client, event, draft: event }), { changed: false });
  assert.equal(client.calls.length, 0);
});
test('untouched editor draft preserves null values and absent fields', () => {
  assert.deepEqual(eventDetailsPatch(event, eventEditorDraft(event)), {});
  assert.deepEqual(eventDetailsPatch(event, { event_name: 'Updated' }), { event_name: 'Updated' });
});
test('schedule and venue changes maintain source-derived fields', () => {
  assert.deepEqual(eventDetailsPatch(event, { start_date: '2026-11-20', end_date: '2026-11-21', venues: 'Court A\nCourt A\nCourt B' }), { start_date: '2026-11-20', end_date: '2026-11-21', event_dates: '20 - 21 November 2026', venues: ['Court A', 'Court B'], venue: 'Court A / Court B' });
});
test('registration times use South African time and compare instants', () => {
  const original = { ...event, registration_closes_at: '2026-11-20T10:00:00+02:00' };
  assert.equal(eventDetailsPatch(original, { registration_opens_at: '2026-11-20T09:00' }).registration_opens_at, '2026-11-20T07:00:00.000Z');
  assert.throws(() => eventDetailsPatch(original, { registration_opens_at: '2026-11-20T11:00' }), /closing must follow/);
});
test('payment mode keeps legacy flags linked and validates EFT/external details', () => {
  const patch = eventDetailsPatch(event, { payment_method: 'free' });
  assert.equal(patch.allow_payments, false); assert.equal(patch.finance_managed, false);
  assert.throws(() => eventDetailsPatch(event, { payment_method: 'eft' }), /EFT requires/);
  assert.throws(() => eventDetailsPatch(event, { payment_method: 'external', external_payment_url: 'javascript:test' }), /http or https/);
});
test('existing division edits never touch class links, activation, or names', () => {
  const original = { id: 3, name: 'Open', entry_fee: 600, rankedin_class_id: 14, is_active: true };
  assert.deepEqual(divisionDetailsPatch(original, { entry_fee: '700', rankedin_class_id: null, is_active: false }), { entry_fee: 700 });
  assert.throws(() => divisionDetailsPatch(original, { name: 'Different' }), /renaming/);
  assert.throws(() => divisionDetailsPatch({ ...original, is_active: false }, { entry_fee: '700' }), /Inactive/);
});
test('cancelled events cannot be edited or have payments reenabled', async () => {
  assert.throws(() => eventDetailsPatch({ ...event, event_status: 'cancelled' }, { payment_method: 'platform' }), /cancelled/);
  const client = fake({ fresh: { ...event, event_status: 'cancelled' } });
  await assert.rejects(saveEventDetails({ client, event, draft: { event_name: 'Changed' } }), /cancelled/);
  assert.equal(client.calls.filter(row => row.payload).length, 0);
});
test('stale inactive division stops every write before saving event changes', async () => {
  const division = { id: 1, name: 'Open', entry_fee: 600, is_active: true };
  const client = fake({ freshDivision: { ...division, is_active: false } });
  await assert.rejects(saveEventDetails({ client, event, draft: { event_name: 'Updated' }, divisions: [division], divisionDrafts: [{ ...division, entry_fee: 700 }] }), /Division details changed/);
  assert.equal(client.calls.filter(row => row.payload).length, 0);
});
test('new divisions use source defaults and never fabricate external links', async () => {
  const draft = { name: "Men's Advanced", entry_fee: '500', gender: 'Men', format: 'Knockout', license_required: true };
  const row = newDivisionRecord(draft);
  assert.equal(row.entry_fee, 500); assert.equal(row.is_active, true); assert.equal(row.scoring_point, 'golden'); assert.equal(row.rankedin_class_id, undefined);
  const client = fake({ currentDivisions: [{ id: 4, name: 'Open', sort_order: 2 }] });
  await saveEventDetails({ client, event, draft: {}, divisions: [], divisionDrafts: [draft] });
  const write = client.calls.find(call => call.insert);
  assert.equal(write.payload[0].event_id, event.id); assert.equal(write.payload[0].sort_order, 3);
  await assert.rejects(saveEventDetails({ client: fake({ currentDivisions: [{ name: "men's advanced" }] }), event, draft: {}, divisionDrafts: [draft] }), /already exists/);
  assert.throws(() => newDivisionRecord({ ...draft, entry_fee: '' }), /entry fee/);
});
test('player gift selection keeps legacy gift and T-shirt collection fields aligned', () => {
  const patch = eventDetailsPatch(event, { player_gift_types: ['tshirt', 'cap'] });
  assert.deepEqual(patch.player_gift_types, ['tshirt', 'cap']); assert.equal(patch.player_gift_type, 'tshirt'); assert.equal(patch.collect_tshirt_size, true);
});
