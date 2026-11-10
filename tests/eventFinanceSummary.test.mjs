import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildFinanceOverviewSummaries } from '../src/utils/eventFinanceSummary.js';
import { buildEventSettlements } from '../src/utils/eventSettlement.js';
import { createSummaryHandler } from '../supabase/functions/event-finance-summary/handler.mjs';
import { buildSummaryBundle } from '../scripts/build-event-finance-summary.mjs';
import { loadFinanceOverviewSummaries } from '../src/utils/eventFinanceOverviewData.js';
import { readOverviewCache, writeOverviewCache, invalidateOverviewSummary, clearOverviewCache } from '../src/utils/eventFinanceOverviewCache.js';

const source = {
    events: [{ id: 101, is_manual: true, organiser_interim_payments: [{ id: 'payout', amount: 100 }] }, { id: 102, entry_fee: 600 }],
    divisions: [{ id: 'open', event_id: 101, name: 'Open', entry_fee: 600 }],
    registrations: [
        { id: 'a', event_id: 101, email: 'full@example.com', full_name: 'Private Name', division_id: 'open', division: 'Open', status: 'registered', payment_status: 'paid' },
        { id: 'b', event_id: 101, email: 'temp@example.com', division_id: 'open', division: 'Open', status: 'registered', payment_status: 'paid' },
        { id: 'c', event_id: 101, email: 'unpaid@example.com', division_id: 'open', division: 'Open', status: 'registered', payment_status: 'pending' },
        { id: 'comp', event_id: 101, email: 'comp@example.com', division_id: 'open', division: 'Open', status: 'registered', payment_status: 'paid' },
        { id: 'old', event_id: 101, email: 'old@example.com', division_id: 'open', division: 'Open', status: 'withdrawn', payment_status: 'paid' },
    ],
    participants: [{ id: 'ranked', event_id: 102, email: 'ranked@example.com', profile_id: 8, full_name: 'Ranked Player', class_name: 'Open', is_paid: false }],
    payments: [
        { id: 'pay-a', event_id: 101, reference: 'A', amount: 600, status: 'success', payment_type: 'event_entry_fee', payment_method: 'paystack', metadata: { registration_id: 'a' } },
        { id: 'pay-b', event_id: 101, reference: 'B', amount: 600, status: 'success', payment_type: 'event_entry_fee', payment_method: 'cash', metadata: { registration_id: 'b', collection_recipient: 'organiser' } },
        { id: 'pay-comp', event_id: 101, reference: 'COMP', amount: 0, status: 'success', payment_type: 'event_entry_fee', metadata: { registration_id: 'comp', free_entry: true } },
        { id: 'pay-old', event_id: 101, reference: 'OLD', amount: 600, status: 'success', payment_type: 'event_entry_fee', payment_method: 'paystack', metadata: { registration_id: 'old' } },
    ],
    refunds: [{ id: 'refund', payment_id: 'pay-old', event_registration_id: 'old', amount: 550, status: 'processed' }],
    licenses: [{ event_id: 101, identity: 'full@example.com', eligibility: { full: true } }, { event_id: 101, identity: 'temp@example.com', eligibility: { temporary: true } }],
};

test('summary preserves report settlement values, licences and privacy', () => {
    const result = buildFinanceOverviewSummaries(source);
    for (const event of buildEventSettlements(source)) {
        const summary = result.find(row => row.id === event.id);
        for (const [key, value] of Object.entries(summary.settlement)) assert.deepEqual(value, event.settlement[key], key);
        assert.equal(summary.stats.entries, event.settlement.activeEntries);
    }
    assert.deepEqual(result[0].stats.licenses, { full: 1, temp: 1, none: 2 });
    assert.equal(result[0].stats.uniquePlayersCount, 4);
    assert.doesNotMatch(JSON.stringify(result), /Private Name|full@example.com|receiptRows|allocations|registration_id/);
});

test('server bundle is generated from the current report/summary rules', async () => {
    const bundle = await buildSummaryBundle(false);
    const saved = await readFile(new URL('../supabase/functions/event-finance-summary/summary.mjs', import.meta.url), 'utf8');
    assert.equal(saved, bundle.outputFiles[0].text);
    const server = await import('../supabase/functions/event-finance-summary/summary.mjs');
    assert.deepEqual(server.buildFinanceOverviewSummaries(source), buildFinanceOverviewSummaries(source));
});

test('a participant without a profile cannot inherit a numeric namesake’s licence', () => {
    const summaries = buildFinanceOverviewSummaries({ ...source, events: [source.events[1]],
        participants: [source.participants[0], { id: 'no-profile', event_id: 102, full_name: '8', class_name: 'Open' }],
        licenses: [{ event_id: 102, identity: '8', eligibility: { full: true } }],
    });
    assert.deepEqual(summaries[0].stats.licenses, { full: 1, temp: 0, none: 1 });
});

const request = (ids = [101], authorization = 'Bearer user-token') => new Request('https://example.test/summary', {
    method: 'POST', headers: { Authorization: authorization, 'Content-Type': 'application/json' }, body: JSON.stringify({ event_ids: ids }),
});
function handler({ user = { id: 'actor' }, error = null, data = { ...source, events: [source.events[0]] } } = {}) {
    const calls = [];
    const serve = createSummaryHandler({ url: 'https://project.test', key: 'publishable', summarize: buildFinanceOverviewSummaries,
        createClient(url, key, options) {
            calls.push({ url, key, options });
            return { auth: { getUser: async () => ({ data: { user } }) }, rpc: async (name, args) => { calls.push({ name, args }); return { data, error }; } };
        },
    });
    return { serve, calls };
}

test('summary endpoint uses the caller token and returns compact results from one RPC', async () => {
    const { serve, calls } = handler();
    const response = await serve(request([101, 101]));
    assert.equal(response.status, 200);
    assert.deepEqual(calls[1], { name: 'event_finance_overview_source', args: { p_event_ids: [101] } });
    assert.equal(calls[0].options.global.headers.Authorization, 'Bearer user-token');
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    assert.doesNotMatch(await response.text(), /full@example.com|Private Name|registration_id/);
});

test('summary endpoint rejects anonymous, invalid, oversized, forbidden and incomplete requests', async () => {
    let fixture = handler();
    assert.equal((await fixture.serve(request([101], ''))).status, 401);
    assert.equal(fixture.calls.length, 0);
    for (const ids of [[], [0], ['101'], [1.2], Array(26).fill(101)]) assert.equal((await fixture.serve(request(ids))).status, 400);
    fixture = handler({ user: null });
    assert.equal((await fixture.serve(request())).status, 401);
    assert.equal(fixture.calls.length, 1);
    fixture = handler({ error: { code: '42501', message: 'private database details' } });
    const denied = await fixture.serve(request());
    assert.equal(denied.status, 403);
    assert.doesNotMatch(await denied.text(), /private database details/);
    fixture = handler({ data: { events: [] } });
    assert.equal((await fixture.serve(request())).status, 500);
});

test('client batches summaries in groups of 5 and rejects missing or duplicate results', async () => {
    const calls = [];
    const ids = Array.from({ length: 13 }, (_, index) => index + 1);
    const client = { functions: { invoke: async (name, { body }) => {
        calls.push(body.event_ids);
        return { data: { summaries: body.event_ids.map(id => ({ ...buildFinanceOverviewSummaries(source)[0], id })) } };
    } } };
    const batches = [];
    await loadFinanceOverviewSummaries(client, ids, rows => batches.push(rows));
    assert.deepEqual(calls.map(rows => rows.length), [5, 5, 3]);
    assert.deepEqual(batches.flat().map(row => row.id), ids);
    for (const rows of [[], [{ id: 1, stats: {}, settlement: {} }, { id: 1, stats: {}, settlement: {} }]]) {
        await assert.rejects(loadFinanceOverviewSummaries({ functions: { invoke: async () => ({ data: { summaries: rows } }) } }, [1, 2], () => assert.fail('partial results')), /Incomplete/);
    }
});

test('memory cache expires, separates account/permission/filter scopes and invalidates edited events everywhere', () => {
    clearOverviewCache();
    const rows = [{ id: 101, stats: { entries: 7 }, settlement: { grossEntryFees: 600 } }];
    writeOverviewCache('actor-a:events-101:gold', rows);
    writeOverviewCache('actor-a:events-101:bronze', rows);
    assert.equal(readOverviewCache('actor-b:events-101:gold'), null);
    assert.equal(readOverviewCache('actor-a:events-102:gold'), null);
    invalidateOverviewSummary(101);
    assert.equal(readOverviewCache('actor-a:events-101:gold')[0].stats, undefined);
    assert.equal(readOverviewCache('actor-a:events-101:bronze')[0].stats, undefined);
    assert.equal(readOverviewCache('actor-a:events-101:gold', Date.now() + 120_001), null);
    clearOverviewCache();
    assert.equal(readOverviewCache('actor-a:events-101:bronze'), null);
});
