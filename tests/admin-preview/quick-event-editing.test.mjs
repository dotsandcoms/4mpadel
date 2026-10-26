import test from 'node:test';
import assert from 'node:assert/strict';
import { loadQuickEventSnapshot, verifyQuickEventAccess } from '../../src/pages/admin-preview/quickEventEditing.js';

function fixture() {
  const state = { role: 'super_admin', calendar: [{ id: 7, is_manual: true, is_quick_event: true, event_name: 'Social' }], tournament_divisions: [{ id: 8, event_id: 7, name: 'Advanced', entry_fee: 150 }] };
  const client = {
    auth: { getUser: async () => ({ data: { user: { email: 'qa@example.test' } } }) },
    from(table) {
      const filters = [];
      const rows = () => structuredClone(state[table].filter(row => filters.every(([key, value]) => row[key] === value)));
      const query = {
        select() { return query; }, eq(key, value) { filters.push([key, value]); return query; }, order() { return query; },
        single: async () => ({ data: rows()[0] }), maybeSingle: async () => ({ data: { role: state.role } }),
        range: async (start, end) => ({ data: rows().slice(start, end + 1) }),
      };
      return query;
    },
  };
  return { state, client };
}
const context = snapshot => ({ event: { ...snapshot.event, _quickDivision: snapshot.divisions[0] } });

test('quick edit uses the recorded division and checks fresh permission', async () => {
  const { state, client } = fixture();
  const snapshot = await loadQuickEventSnapshot(client, 7);
  assert.equal(snapshot.divisions[0].name, 'Advanced');
  await verifyQuickEventAccess(client, snapshot, context(snapshot));
  state.role = 'admin';
  await assert.rejects(verifyQuickEventAccess(client, snapshot, context(snapshot)), /super-admin/);
});
test('quick edit refuses missing or ambiguous divisions', async () => {
  for (const count of [0, 2]) {
    const { state, client } = fixture();
    state.tournament_divisions = Array.from({ length: count }, (_, index) => ({ id: index + 8, event_id: 7 }));
    await assert.rejects(loadQuickEventSnapshot(client, 7), /exactly one division/);
  }
});
test('quick edit refuses other builders, imported and cancelled records', async () => {
  for (const patch of [{ is_quick_event: false }, { is_weekly: true }, { is_manual: false }, { event_status: 'cancelled' }]) {
    const { state, client } = fixture(); Object.assign(state.calendar[0], patch);
    await assert.rejects(loadQuickEventSnapshot(client, 7), /not a quick event|Imported|Cancelled/);
  }
});
test('event and division changes are detected before saving', async () => {
  for (const table of ['calendar', 'tournament_divisions']) {
    const { state, client } = fixture(); const snapshot = await loadQuickEventSnapshot(client, 7);
    state[table][0].updated_at = 'concurrent update';
    await assert.rejects(verifyQuickEventAccess(client, snapshot, context(snapshot)), /changed since opening/);
  }
});
test('quick editor cannot target another event or division', async () => {
  const { client } = fixture(); const snapshot = await loadQuickEventSnapshot(client, 7);
  for (const event of [{ id: 99, _quickDivision: { id: 8 } }, { id: 7, _quickDivision: { id: 99 } }, { id: 7 }]) {
    await assert.rejects(verifyQuickEventAccess(client, snapshot, { event }), /identity changed/);
  }
});
