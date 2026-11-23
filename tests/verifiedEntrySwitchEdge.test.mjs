import assert from 'node:assert/strict';
import test, { beforeEach, afterEach } from 'node:test';
import { completeVerifiedEntrySwitch, dispatchVerifiedSwitchRefund, reviewVerifiedEntrySwitch } from '../supabase/functions/paystack-refund/verified-entry-switch.ts';

const input = { eventId: 17, registrationId: 'entry-id', targetDivisionId: 'destination', actorEmail: 'new@example.invalid', eventManager: false, topUpReference: 'SWITCH-fixture' };
const review = { from_division: 'Open', from_division_id: 'origin', division: 'Advanced', division_id: 'destination', delta: 50, old_fee: 350, new_fee: 400 };
const topUp = { id: 'top-up', event_id: 17, status: 'success', reference: input.topUpReference, amount: 50, is_test: false,
    payment_type: 'event_entry_fee', payment_method: 'paystack', currency: 'ZAR',
    metadata: { source: 'division_switch', registration_id: input.registrationId, target_division_id: input.targetDivisionId,
        from_division: review.from_division, registrant_email: input.actorEmail } };
const original = { ...topUp, id: 'original', reference: 'EVREG-fixture', amount: 350 };
const verified = { id: 7001, reference: input.topUpReference, currency: 'ZAR', amount: 5000, status: 'success', domain: 'live', customer: { email: 'New@example.invalid' } };
const refundReference = '4m-refund-fixture-original';
const providerRefund = { id: 7003, refund_reference: refundReference, domain: 'live', transaction: 7002, currency: 'ZAR', amount: 5000, status: 'pending' };
const json = (status, body) => Response.json(body, { status });

function edgeFixture(options = {}) {
    const rpcCalls = [], providerCalls = [];
    const refund = { id: 'refund', amount: 50, currency: 'ZAR', payment_id: original.id, event_registration_id: input.registrationId,
        paystack_reference: original.reference, reason: 'division_switch', status: 'failed',
        metadata: { verify_failed: true, verified_switch_reservation: true, ...options.refundMetadata } };
    const records = { payments: [options.payment || topUp, original], payment_refunds: [refund], event_registrations: [{ id: input.registrationId, event_id: input.eventId }] };
    const service = {
        from(table) {
            let rows = records[table];
            const query = { select() { return query; }, eq(key, value) { rows = rows.filter(row => row[key] === value); return query; },
                async maybeSingle() { return { data: rows[0] ? structuredClone(rows[0]) : null }; } };
            return query;
        },
        async rpc(name, args) {
            rpcCalls.push([name, args]);
            if (name === 'review_verified_entry_switch') return { data: options.reviewed ?? null, error: options.reviewError };
            if (name === 'commit_verified_entry_switch') return { data: { ...review, completed: true, ...options.committed } };
            if (name === 'claim_event_refund_retry') {
                if (refund.status !== 'failed') return { data: null };
                refund.metadata.reviewed_retry = { phase: 'held', reference: refundReference, method: 'paystack', domain: 'live', transaction_id: '7002', transaction_reference: original.reference };
                refund.status = 'needs_attention';
                return { data: refund.metadata.reviewed_retry };
            }
            if (name === 'apply_event_refund_retry_evidence') {
                refund.metadata.reviewed_retry.phase = 'verified';
                refund.status = args.p_status;
                refund.paystack_refund_id = args.p_provider_id;
                return { data: { id: refund.id, status: refund.status, paystack_refund_id: refund.paystack_refund_id } };
            }
            throw new Error(`Unexpected RPC ${name}`);
        },
    };
    const fixture = { ...options, service, rpcCalls, providerCalls, refund };
    globalThis.fetch = async (url, init) => {
        providerCalls.push([url, init?.method || 'GET', init?.body ? JSON.parse(init.body) : null]);
        if (url.endsWith(`/verify/${topUp.reference}`)) return json(200, { status: true, data: { ...verified, ...fixture.gateway } });
        if (url.endsWith(`/verify/${original.reference}`)) return json(200, { status: true, data: { ...verified, id: 7002, reference: original.reference, amount: 35000 } });
        if (url.endsWith('/refund') && init.method === 'POST') {
            if (fixture.lostResponse) throw new Error('Simulated timeout after submitting the original refund');
            return json(200, { status: true, data: providerRefund });
        }
        if (url.endsWith(`/refund?reference=${refundReference}`)) return json(200, { status: true, data: fixture.found ? [providerRefund] : [] });
        throw new Error(`Unexpected provider call ${url}`);
    };
    return fixture;
}

const fetchBefore = globalThis.fetch;
beforeEach(() => { globalThis.Deno = { env: { get: key => key === 'PAYSTACK_SECRET_KEY' ? 'sk_live_fixture' : '' } }; });
afterEach(() => { globalThis.fetch = fetchBefore; delete globalThis.Deno; });

test('protected review refuses backend errors instead of falling through to the legacy payment route', async () => {
    const fixture = edgeFixture({ reviewError: { message: 'Held' } });
    await assert.rejects(reviewVerifiedEntrySwitch(fixture.service, input), /Held/);
    assert.deepEqual(fixture.rpcCalls[0], ['review_verified_entry_switch', {
        p_event_id: 17, p_registration_id: 'entry-id', p_target_division_id: 'destination', p_actor_email: input.actorEmail,
        p_event_manager: false, p_top_up_reference: input.topUpReference,
    }]);
    assert.equal(fixture.providerCalls.length, 0);
});

test('protected top-up requires the exact captured amount and provider payer, even when the ledger says success', async () => {
    const wrongSaved = edgeFixture({ payment: { ...topUp, amount: 51 } });
    assert.equal((await completeVerifiedEntrySwitch(wrongSaved.service, input, review, json)).status, 409);
    assert.equal(wrongSaved.providerCalls.length, 0);
    const wrongPayer = edgeFixture({ gateway: { customer: { email: 'former@example.invalid' } } });
    assert.equal((await completeVerifiedEntrySwitch(wrongPayer.service, input, review, json)).status, 409);
    assert.equal(wrongPayer.rpcCalls.length, 0);
    const good = edgeFixture();
    assert.equal((await completeVerifiedEntrySwitch(good.service, input, review, json)).completed, true);
    assert.deepEqual(good.rpcCalls[0][1].p_gateway, {
        reference: input.topUpReference, amount: 5000, currency: 'ZAR', domain: 'live', customer_email: input.actorEmail, id: '7001',
    });
    assert.equal(good.providerCalls.length, 1);
});

test('a completed protected top-up replay needs neither a gateway call nor another ledger write', async () => {
    const fixture = edgeFixture();
    const done = { ...review, completed: true, replayed: true };
    assert.equal(await completeVerifiedEntrySwitch(fixture.service, input, done, json), done);
    assert.equal(fixture.rpcCalls.length, 0);
    assert.equal(fixture.providerCalls.length, 0);
});

test('lower-fee switch commits its move before issuing one refund on the original charge', async () => {
    const lower = { ...review, delta: -50, new_fee: 300 };
    const noCharge = { ...input, topUpReference: undefined };
    const fixture = edgeFixture({ committed: { ...lower, refund_id: 'refund' } });
    const moved = await completeVerifiedEntrySwitch(fixture.service, noCharge, lower, json);
    assert.equal(moved.refund_id, 'refund');
    assert.equal(fixture.providerCalls.length, 0);
    await Promise.all([1, 2].map(() => dispatchVerifiedSwitchRefund(fixture.service, noCharge, moved.refund_id, json)));
    const submits = fixture.providerCalls.filter(call => call[1] === 'POST');
    assert.equal(submits.length, 1);
    assert.deepEqual(submits[0][2], { transaction: original.reference, amount: 5000, currency: 'ZAR', reference: refundReference });
    assert.equal(fixture.refund.status, 'processing');
    assert.equal(fixture.rpcCalls.find(([name]) => name === 'claim_event_refund_retry')[1].p_actor, input.actorEmail);
});

test('a lost refund response can reconcile the original attempt and never re-posts', async () => {
    const fixture = edgeFixture({ lostResponse: true });
    assert.equal(await dispatchVerifiedSwitchRefund(fixture.service, input, fixture.refund.id, json), 'needs_attention');
    fixture.found = true;
    assert.equal(await dispatchVerifiedSwitchRefund(fixture.service, input, fixture.refund.id, json), 'processing');
    assert.equal(fixture.providerCalls.filter(call => call[1] === 'POST').length, 1);
    const unmarked = edgeFixture({ refundMetadata: { verified_switch_reservation: false } });
    assert.equal(await dispatchVerifiedSwitchRefund(unmarked.service, input, unmarked.refund.id, json), 'pending');
    assert.equal(unmarked.providerCalls.length, 0);
});
