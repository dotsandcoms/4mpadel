import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEventAdvancedSnapshot, verifyEventAdvancedAccess } from '../../src/pages/admin-preview/eventAdvancedGuard.js';

function fixture() {
  const state = {
    user: { email: 'admin@test' }, role: 'super_admin',
    calendar: [{ id: 1, is_manual: true, event_name: 'Event', is_weekly: false, event_status: 'upcoming', pending_changes: null }],
    tournament_divisions: [{ id: 2, event_id: 1, name: 'Open', entry_fee: 500, sort_order: 0 }],
  };
  const client = {
    auth: { async getUser() { return { data: { user: state.user } }; } },
    from(table) {
      const filters = []; const query = {
        select() { return query; }, eq(key, value) { filters.push([key, value]); return query; }, order() { return query; },
        async single() { return { data: structuredClone(state[table].find(row => filters.every(([key, value]) => row[key] === value))) }; },
        async maybeSingle() { return { data: { role: state.role } }; },
        async range(start, end) { return { data: structuredClone(state[table].filter(row => filters.every(([key, value]) => row[key] === value)).slice(start, end + 1)) }; },
      }; return query;
    },
  };
  return { state, client };
}
async function baseline(f) { const snapshot = await loadEventAdvancedSnapshot(f.client, 1); return { client: f.client, original: snapshot.event, divisions: snapshot.divisions, siblings: snapshot.siblings }; }

test('advanced guard freshly authorizes superadmin and accepts unchanged manual event', async () => {
  const f = fixture(), args = await baseline(f);
  assert.equal((await verifyEventAdvancedAccess(args)).event.id, 1);
  f.state.role = 'admin'; await assert.rejects(verifyEventAdvancedAccess(args), /super-admin/);
  f.state.user = null; await assert.rejects(verifyEventAdvancedAccess(args), /Sign in/);
});
test('guard binds actor and all-workspaces scope even when another actor is superadmin', async () => {
  const f = fixture(), args = await baseline(f);
  f.state.user.id = 'actor-a';
  await verifyEventAdvancedAccess({ ...args, expectedUserId: 'actor-a' });
  await assert.rejects(verifyEventAdvancedAccess({ ...args, expectedUserId: 'actor-b' }), /account changed/);
  await assert.rejects(verifyEventAdvancedAccess({ ...args, scopeId: 'organisation-a' }), /all-workspaces/);
});
test('guard prevents cancelled and imported events including state changes after opening', async () => {
  for (const patch of [{ event_status: 'cancelled' }, { is_manual: false }]) {
    const f = fixture(), args = await baseline(f); Object.assign(f.state.calendar[0], patch);
    await assert.rejects(verifyEventAdvancedAccess(args), /Cancelled|Imported/);
  }
});
test('full event comparison includes pending amendments and nested payloads but ignores UI enrichment', async () => {
  const f = fixture(); f.state.calendar[0].pending_changes = { payload: { event_name: 'Amended' } }; f.state.calendar[0].pending_changes_status = 'pending';
  const args = await baseline(f); args.original._displayName = 'UI';
  await verifyEventAdvancedAccess(args);
  f.state.calendar[0].pending_changes.payload.event_name = 'Changed again';
  await assert.rejects(verifyEventAdvancedAccess(args), /Event details changed/);
});
test('division additions, removals, updates and partial baseline are rejected', async () => {
  for (const change of [rows => rows.push({ id: 3, event_id: 1 }), rows => rows.splice(0), rows => { rows[0].entry_fee = 600; }]) {
    const f = fixture(), args = await baseline(f); change(f.state.tournament_divisions);
    await assert.rejects(verifyEventAdvancedAccess(args), /Divisions changed/);
  }
  const f = fixture(), args = await baseline(f); args.divisions = [{ id: 2 }];
  await assert.rejects(verifyEventAdvancedAccess(args), /Divisions changed/);
});
test('weekly snapshot detects sibling content and membership changes', async () => {
  for (const change of [rows => { rows[1].event_name = 'Concurrent edit'; }, rows => rows.pop(), rows => rows.push({ ...rows[1], id: 3 })]) {
    const f = fixture(); Object.assign(f.state.calendar[0], { is_weekly: true, series_id: 'series' });
    f.state.calendar.push({ ...f.state.calendar[0], id: 2, start_date: '2026-10-08' });
    const args = await baseline(f); change(f.state.calendar);
    await assert.rejects(verifyEventAdvancedAccess(args), /Weekly series changed/);
  }
});
test('snapshot owns immutable copies and division order does not affect conflict checks', async () => {
  const f = fixture(); f.state.tournament_divisions.push({ id: 3, event_id: 1, name: 'Mixed' });
  const args = await baseline(f); f.state.tournament_divisions.reverse();
  await verifyEventAdvancedAccess(args);
  f.state.calendar[0].event_name = 'New'; assert.equal(args.original.event_name, 'Event');
});
test('weekly cascade is blocked if any sibling is cancelled or imported', async () => {
  for (const patch of [{ event_status: 'cancelled' }, { is_manual: false }]) {
    const f = fixture(); Object.assign(f.state.calendar[0], { is_weekly: true, series_id: 'series' });
    f.state.calendar.push({ ...f.state.calendar[0], id: 2, ...patch });
    await assert.rejects(loadEventAdvancedSnapshot(f.client, 1), /cancelled or imported occurrences/);
  }
});
