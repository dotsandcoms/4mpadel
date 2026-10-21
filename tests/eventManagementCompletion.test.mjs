import test from 'node:test';
import assert from 'node:assert/strict';
import { loadManagedEventCompletions, managedEventStage, partitionManagedEvents, setManagedEventCompleted } from '../src/utils/eventManagementCompletion.js';

const today = new Date('2026-10-17T12:00:00Z');
const nationals = { id: 479, event_name: 'SA Nationals', start_date: '2026-10-16', end_date: '2026-10-16' };

test('past events remain active until explicitly completed, including existing historical events', () => {
    const events = [nationals, { id: 2, start_date: '2026-01-01' }, { id: 3, start_date: '2027-01-01' }];
    const snapshot = structuredClone(events);
    assert.deepEqual(partitionManagedEvents(events), { activeEvents: events, completedEvents: [] });
    assert.deepEqual(events, snapshot);
    assert.equal(managedEventStage(nationals, today), 'Awaiting completion');
});

test('manual completion and reopening determine grouping regardless of dates', () => {
    const completed = { ...nationals, management_completed_at: '2026-10-17T12:00:00Z' };
    const futureCompleted = { id: 3, start_date: '2027-01-01', management_completed_at: completed.management_completed_at };
    const reopened = { ...completed, management_completed_at: null };
    assert.deepEqual(partitionManagedEvents([completed, reopened, futureCompleted]), { activeEvents: [reopened], completedEvents: [completed, futureCompleted] });
    assert.equal(managedEventStage(completed, today), 'Completed');
    assert.equal(managedEventStage(reopened, today), 'Awaiting completion');
});

test('multi-day events and South African midnight get accurate labels without auto-completion', () => {
    assert.equal(managedEventStage({ ...nationals, end_date: '2026-10-18' }, today), 'In progress');
    assert.equal(managedEventStage({ start_date: '2026-10-18' }, today), 'Upcoming');
    assert.equal(managedEventStage({ start_date: '2026-10-18' }, new Date('2026-10-17T22:30:00Z')), 'In progress');
    assert.equal(managedEventStage({ start_date: null }, today), 'Active');
    assert.equal(managedEventStage({ start_date: 'invalid' }, today), 'Active');
});

test('completion loader pages past the API row limit and normalises event IDs', async () => {
    const ranges = [];
    const client = { from(table) {
        assert.equal(table, 'event_management_completion');
        return { select(columns) { assert.equal(columns, 'event_id, completed_at'); return this; }, order() { return this; }, async range(from, to) {
            ranges.push([from, to]);
            return { data: from === 0 ? Array.from({ length: 1000 }, (_, i) => ({ event_id: String(i), completed_at: null })) : [{ event_id: '1001', completed_at: '2026-10-17T12:00:00Z' }], error: null };
        } };
    } };
    const result = await loadManagedEventCompletions(client);
    assert.equal(result.get(1001), '2026-10-17T12:00:00Z');
    assert.deepEqual(ranges, [[0, 999], [1000, 1999]]);
});

test('completion-load failures propagate instead of showing completed events as active', async () => {
    const error = new Error('Access check failed');
    const client = { from() { return { select() { return this; }, order() { return this; }, range: async () => ({ error }) }; } };
    await assert.rejects(loadManagedEventCompletions(client), error);
});

test('completion and reopening send the expected previous state to one RPC', async () => {
    let expected = null;
    const stamp = '2026-10-17T12:00:00Z';
    const client = { async rpc(name, args) {
        assert.equal(name, 'set_event_management_completed');
        assert.equal(args.p_event_id, nationals.id);
        assert.equal(args.p_expected_completed_at, expected);
        return { data: { event_id: nationals.id, completed_at: args.p_completed ? stamp : null }, error: null };
    } };
    const result = await setManagedEventCompleted(client, nationals, true);
    expected = stamp;
    assert.deepEqual(await setManagedEventCompleted(client, { ...nationals, management_completed_at: result.completed_at }, false), { event_id: nationals.id, completed_at: null });
});

test('mutation errors or mismatched responses never produce a successful local state', async () => {
    const error = new Error('Completion status changed');
    await assert.rejects(setManagedEventCompleted({ rpc: async () => ({ error }) }, nationals, true), error);
    await assert.rejects(setManagedEventCompleted({ rpc: async () => ({ data: { event_id: 999 } }) }, nationals, true), /Could not confirm/);
});
