import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchEventEntryCounts } from '../src/utils/calendarEvents.js';

function registrationClient(rows, failAt = null) {
    const requests = [];
    return {
        requests,
        from(table) {
            assert.equal(table, 'event_registrations_public');
            const request = {};
            return {
                select(columns) {
                    assert.equal(columns, 'id, event_id');
                    return this;
                },
                in(column, ids) {
                    assert.equal(column, 'event_id');
                    request.ids = ids;
                    return this;
                },
                order(column, options) {
                    assert.equal(column, 'id');
                    assert.deepEqual(options, { ascending: true });
                    return this;
                },
                async range(from, to) {
                    requests.push({ ...request, from, to });
                    if (from === failAt) return { data: null, error: new Error('Count query failed') };
                    const matching = rows.filter(row => request.ids.includes(row.event_id))
                        .sort((a, b) => a.id - b.id);
                    return { data: matching.slice(from, to + 1), error: null };
                },
            };
        },
    };
}

test('counts all 1,089 calendar entries, including Durban registrations beyond the first 1,000', async () => {
    const rows = Array.from({ length: 1089 }, (_, index) => ({
        id: index + 1,
        event_id: index >= 984 && index < 1004 ? 471 : 470,
    }));
    assert.equal(rows.slice(0, 1000).filter(row => row.event_id === 471).length, 16);
    const client = registrationClient(rows);

    assert.deepEqual(await fetchEventEntryCounts(client, [470, 471]), { 470: 1069, 471: 20 });
    assert.deepEqual(client.requests.map(({ from, to }) => [from, to]), [
        [0, 499], [500, 999], [1000, 1499],
    ]);
});

test('continues after an exactly full page and counts each active entry', async () => {
    const rows = Array.from({ length: 500 }, (_, index) => ({ id: index + 1, event_id: 471 }));
    const client = registrationClient(rows);
    assert.deepEqual(await fetchEventEntryCounts(client, [471, 472]), { 471: 500 });
    assert.equal(client.requests.length, 2);
});

test('batches event IDs and avoids counting duplicate event IDs twice', async () => {
    const ids = Array.from({ length: 101 }, (_, index) => index + 1);
    const client = registrationClient(ids.map(id => ({ id, event_id: id })));
    const counts = await fetchEventEntryCounts(client, [...ids, 1]);
    assert.deepEqual(counts, Object.fromEntries(ids.map(id => [id, 1])));
    assert.deepEqual(client.requests.map(request => request.ids.length), [100, 1]);
});

test('skips queries when there are no manual events and returns no entries for an empty event', async () => {
    const client = registrationClient([]);
    assert.deepEqual(await fetchEventEntryCounts(client, []), {});
    assert.equal(client.requests.length, 0);
    assert.deepEqual(await fetchEventEntryCounts(client, [471]), {});
});

test('rejects a failed later page instead of showing partial registration totals', async () => {
    const rows = Array.from({ length: 1001 }, (_, index) => ({ id: index + 1, event_id: 471 }));
    await assert.rejects(fetchEventEntryCounts(registrationClient(rows, 1000), [471]), /Count query failed/);
});
