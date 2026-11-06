import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateEventSettlement, buildEventSettlements, summarizeEventSettlements, eventPayoutRequestLimit } from '../src/utils/eventSettlement.js';

const registration = (id, extra = {}) => ({ id, event_id: 1, email: `${id}@example.com`, division: 'Open', status: 'registered', payment_status: 'paid', ...extra });
const payment = (id, amount, extra = {}) => ({ id, event_id: 1, reference: `REGEV-1-${id}`, amount, status: 'success', payment_type: 'event_entry_fee', payment_method: 'paystack', metadata: { registration_id: id, email: `${id}@example.com` }, ...extra });
const manual = (id, amount, recipient) => payment(id, amount, { reference: `MANUAL-ADMIN-${id}`, payment_method: 'eft', metadata: { registration_id: id, email: `${id}@example.com`, source: 'manual_event_admin', collection_recipient: recipient } });
const refund = (id, amount, extra = {}) => ({ id: `refund-${id}`, payment_id: id, amount, status: 'processed', metadata: { cover_type: 'entry' }, ...extra });
const calculate = extra => calculateEventSettlement({ event: { id: 1, entry_fee: 600 }, ...extra });

function documentExample(direct = 0, payouts = []) {
    return calculate({
        registrations: [registration('gateway'), registration('eft'), registration('unpaid', { payment_status: 'pending' }), ...(direct ? [registration('club')] : [])],
        payments: [payment('gateway', 188600 - direct), manual('eft', 8800, '4m'), ...(direct ? [manual('club', direct, 'organiser')] : [])],
        refunds: [refund('gateway', 28000, { event_registration_id: 'gateway' })],
        entryFeeForRegistration: r => r.id === 'unpaid' ? 3200 : 600,
        interimPayments: payouts,
    });
}

test('the document example reconciles billed, collections, refunds, fee and balance exactly', () => {
    const s = documentExample();
    assert.deepEqual([s.totalAmountBilled, s.pendingAmount, s.grossEntryFees, s.entryFeesRefunded, s.entryFeeBalance, s.commission, s.organiserEntitlement, s.dueToOrg],
        [200600, 3200, 197400, 28000, 169400, 9870, 159530, 159530]);
    assert.equal(s.paystackCollected + s.collectedManual + s.collectedOrganiser, s.grossEntryFees);
    assert.equal(s.issues.length, 0);
});

test('direct organiser receipts and completed payouts reduce the transfer, while EFT to 4M stays in it', () => {
    const s = documentExample(5000, [{ id: 'paid-request', amount: 40000 }, { id: 'paid-request', amount: 40000 }, { id: 'pending-request', amount: 10000, status: 'pending' }]);
    assert.equal(s.grossEntryFees, 197400);
    assert.equal(s.collectedManual, 8800);
    assert.equal(s.collectedOrganiser, 5000);
    assert.equal(s.commissionBase, 192400);
    assert.equal(s.commission, 9620);
    assert.equal(s.interimPaid, 40000);
    assert.equal(s.dueToOrg, 114780);
    assert.equal(s.payoutRows.length, 1);
});

test('the screenshot example retains its existing correct figures to the cent', () => {
    const registrations = Array.from({ length: 87 }, (_, i) => registration(String(i), { payment_status: i < 60 ? 'paid' : 'pending' }));
    const payments = [...Array.from({ length: 60 }, (_, i) => payment(String(i), 600)), payment('withdrawn', 550)];
    const s = calculate({ registrations: [...registrations, registration('withdrawn', { status: 'withdrawn', payment_status: 'refunded' })], payments,
        refunds: [refund('withdrawn', 550, { event_registration_id: 'withdrawn' })] });
    assert.deepEqual([s.activeEntries, s.pendingCount, s.totalAmountBilled, s.grossEntryFees, s.entryFeeBalance, s.commission, s.dueToOrg], [87, 27, 52750, 36550, 36000, 1827.5, 34172.5]);
});

test('method cannot identify recipient; unconfirmed historical manual collections block payouts', () => {
    const s = calculate({ registrations: [registration('a')], payments: [manual('a', 600, undefined)] });
    assert.equal(s.grossEntryFees, 600);
    assert.equal(s.collected4M, 0);
    assert.equal(s.collectedOrganiser, 0);
    assert.equal(s.unconfirmedCollected, 600);
    assert.equal(s.commissionBase, 0);
    assert.equal(s.commission, 0);
    assert.equal(s.availableForPayout, 0);
    assert.match(s.issues.join(' '), /Confirm who received/);
    assert.equal(eventPayoutRequestLimit({ end_date: '2026-10-01' }, s).canRequest, false);
});

test('direct club receipts earn zero commission, including withdrawn collections and refunds', () => {
    const s = calculate({ registrations: [registration('club'), registration('old', { status: 'withdrawn' })],
        payments: [manual('club', 600, 'organiser'), manual('old', 800, 'club')],
        refunds: [refund('old', 800, { metadata: { cover_type: 'entry', refund_funded_by: 'organiser' } })] });
    assert.equal(s.grossEntryFees, 1400);
    assert.equal(s.collectedOrganiser, 1400);
    assert.equal(s.organiserRetained, 600);
    assert.equal(s.commissionBase, 0);
    assert.equal(s.commission, 0);
    assert.equal(s.dueToOrg, 0);
});

test('a refunded team division repaid to the club stays separate from the partner-paid Paystack division', () => {
    const registrations = ['payer', 'partner'].flatMap(id => [
        registration(`${id}-old`, { email: `${id}@example.com`, division: 'Intermediate', status: 'withdrawn', payment_status: 'refunded' }),
        registration(`${id}-club`, { email: `${id}@example.com`, division: 'Intermediate' }),
        registration(`${id}-open`, { email: `${id}@example.com`, division: 'Combined' }),
    ]);
    const checkout = payment('team', 3200, { metadata: { registrant_email: 'payer@example.com', covers: ['payer', 'partner'].flatMap(id =>
        ['Intermediate', 'Combined'].map(division => ({ type: 'entry', email: `${id}@example.com`, division }))) } });
    const clubPayments = ['payer', 'partner'].map(id => manual(`${id}-club`, 800, 'organiser'));
    const s = calculate({ registrations, payments: [checkout, ...clubPayments],
        refunds: ['payer', 'partner'].map(id => refund('team', 800, { id: `refund-${id}`, event_registration_id: `${id}-old` })) });
    assert.deepEqual([s.grossEntryFees, s.collected4M, s.collectedOrganiser, s.entryFeesRefunded, s.commission, s.dueToOrg], [4800, 3200, 1600, 1600, 160, 1440]);
    assert.equal(s.paid4M, 2);
    assert.equal(s.paidClub, 2);
    assert.equal(s.pendingCount, 0);
});

test('all-event statements charge only each event’s 4M collections with no fee on club or unknown receipts', () => {
    const rows = buildEventSettlements({ events: [{ id: 1, is_manual: true, entry_fee: 600 }, { id: 2, is_manual: true, entry_fee: 600 }],
        registrations: [registration('a'), registration('club'), registration('unknown'), registration('b', { event_id: 2 })],
        payments: [payment('a', 600), manual('club', 600, 'organiser'), manual('unknown', 600, undefined), { ...manual('b', 600, 'organiser'), event_id: 2 }] });
    assert.deepEqual(rows.map(r => [r.settlement.commissionBase, r.settlement.commission]), [[600, 30], [0, 0]]);
    assert.equal(summarizeEventSettlements(rows).commission, 30);
});

test('correcting a receipt to organiser-held removes its commission without adding cash', () => {
    const input = { registrations: [registration('a')], payments: [manual('a', 600, '4m')] };
    const before = calculate(input);
    const after = calculate({ ...input, payments: [manual('a', 600, 'organiser')] });
    assert.equal(before.grossEntryFees, after.grossEntryFees);
    assert.equal(before.commission, 30);
    assert.equal(after.commission, 0);
    assert.equal(before.dueToOrg - after.dueToOrg, 570);
    assert.equal(after.dueToOrg, 0);
});

test('pending refunds reserve payout cash without becoming completed refunds or unpaid entries', () => {
    const s = calculate({ registrations: [registration('a')], payments: [payment('a', 600)], refunds: [refund('a', 200, { status: 'processing' })] });
    assert.deepEqual([s.totalAmountBilled, s.pendingAmount, s.entryFeesRefunded, s.refundReserve, s.entryFeeBalance, s.dueToOrg, s.availableForPayout], [600, 0, 0, 200, 600, 570, 370]);
});

test('processed and pending copies of the same provider refund are deducted once as completed', () => {
    const s = calculate({ registrations: [registration('a')], payments: [payment('a', 600)], refunds: [
        refund('a', 100, { id: 'pending-copy', status: 'pending', paystack_refund_id: '42' }),
        refund('a', 100, { id: 'complete-copy', paystack_refund_id: '42' }),
        refund('a', 200, { id: 'failed', status: 'failed' }),
    ] });
    assert.equal(s.entryFeesRefunded, 100);
    assert.equal(s.refundReserve, 0);
    assert.equal(s.dueToOrg, 470);
});

test('an organiser-funded refund reduces their retained receipts instead of being charged to 4M again', () => {
    const s = calculate({ registrations: [registration('gateway'), registration('club')], payments: [payment('gateway', 600), manual('club', 600, 'organiser')],
        refunds: [refund('club', 100, { event_registration_id: 'club', metadata: { cover_type: 'entry', refund_funded_by: 'organiser' } })] });
    assert.equal(s.entryFeesRefunded, 100);
    assert.equal(s.organiserRetained, 500);
    assert.equal(s.dueToOrg, 570); // Only the R600 received by 4M earns commission.
    assert.equal(s.issues.length, 0);
});

test('a refunded old entry cannot supply the price or receipt for an unpaid replacement', () => {
    const old = registration('old', { status: 'withdrawn', payment_status: 'refunded', email: 'a@example.com' });
    const current = registration('current', { payment_status: 'pending', email: old.email });
    const s = calculate({ registrations: [old, current], payments: [payment('old', 550)], refunds: [refund('old', 550, { event_registration_id: 'old' })] });
    assert.equal(s.pendingAmount, 600);
    assert.equal(s.totalAmountBilled, 1150);
    assert.equal(s.entryFeesRefunded, 550);
});

test('one receipt paying two entries is cash once and one fee; licences and test receipts stay out', () => {
    const s = calculate({ registrations: [registration('a'), registration('b')], payments: [payment('a', 1200, { metadata: { covers: [
        { type: 'entry', email: 'a@example.com', division: 'Open' }, { type: 'entry', email: 'b@example.com', division: 'Open' }] } }),
        payment('license', 120, { payment_type: 'temp_license' }), payment('test', 1000, { is_test: true })],
        refunds: [refund('license', 120, { metadata: JSON.stringify({ cover_type: 'license' }) })] });
    assert.deepEqual([s.grossEntryFees, s.paid4M, s.commission, s.entryFeesRefunded, s.dueToOrg], [1200, 2, 60, 0, 1140]);
    assert.equal(s.issues.length, 0);
});

test('fees round to cents and payouts use cents rather than whole-rand rounding', () => {
    const s = calculate({ registrations: [registration('a')], payments: [payment('a', 10.1)] });
    assert.equal(s.commission, 0.51);
    assert.equal(s.dueToOrg, 9.59);
    assert.equal(eventPayoutRequestLimit({ end_date: '2026-12-01' }, s, Date.parse('2026-11-02T10:00:00Z')).maxRequestable, 4.79);
});

test('an explicitly unallocated credit remains collected cash but is not applied to an entry or made available for payout', () => {
    const covers = [{ type: 'entry', email: 'a@example.com', division: 'Open' }];
    const s = calculate({ registrations: [registration('a')], payments: [payment('a', 600, { created_at: '2026-10-01', metadata: { email: 'a@example.com', covers } }), payment('credit', 800, {
        created_at: '2026-10-02', metadata: { email: 'a@example.com', covers, unallocated_credit_amount: 800 },
    })] });
    assert.equal(s.collected4M, 1400);
    assert.equal(s.unallocatedCredit4M, 800);
    assert.equal(s.commission, 70);
    assert.equal(s.dueToOrg, 1330);
    assert.equal(s.availableForPayout, 530);
    assert.equal(s.allocations[0].amount, 600);
    assert.equal(s.pendingAmount, 0);
    assert.deepEqual(s.issues, []);
    assert.equal(s.allocations[0].shares.some(share => share.receipt.reference.endsWith('credit')), false);
    assert.equal(eventPayoutRequestLimit({ end_date: '2026-10-01' }, s).maxRequestable, 530);
    const returned = calculate({ registrations: [], payments: [payment('credit', 800, {
        metadata: { unallocated_credit_amount: 800 },
    })], refunds: [refund('credit', 800)] });
    assert.equal(returned.unallocatedCredit4M, 0);
});

test('event end-day payout rules use South African time and remaining payouts use the current balance', () => {
    const s = documentExample(5000, [{ id: 'first', amount: 40000 }]);
    assert.equal(eventPayoutRequestLimit({ end_date: '2026-11-02' }, s, Date.parse('2026-11-02T21:59:59Z')).canRequest, false);
    assert.equal(eventPayoutRequestLimit({ end_date: '2026-11-02' }, s, Date.parse('2026-11-02T22:00:00Z')).maxRequestable, 114780);
});

test('finance overview uses the same event statements and keeps overpayments separate', () => {
    const events = [{ id: 1, is_manual: true, entry_fee: 600 }, { id: 2, is_manual: true, entry_fee: 600, organiser_interim_payments: [{ id: 'paid', amount: 700 }] }];
    const rows = buildEventSettlements({ events, registrations: [registration('a'), registration('b', { event_id: 2 })],
        payments: [payment('a', 600), payment('b', 600, { event_id: 2 })] });
    assert.equal(rows[0].settlement.dueToOrg, 570);
    assert.equal(rows[1].settlement.dueToOrg, -130);
    assert.deepEqual(summarizeEventSettlements(rows), { events: 2, entries: 2, collected: 1200, refunds: 0, commission: 60, paid: 700, direct: 0, balanceOwed: 570, overpaid: 130 });
    assert.equal(summarizeEventSettlements(rows.slice(0, 1)).paid, 0);
});


test('a refund retaining only its gateway reference is included in the event overview', () => {
    const rows = buildEventSettlements({ events: [{ id: 1, is_manual: true, entry_fee: 600 }], registrations: [registration('a')], payments: [payment('a', 600)],
        refunds: [refund('a', 100, { payment_id: null, paystack_reference: 'REGEV-1-a' })] });
    assert.equal(rows[0].settlement.entryFeesRefunded, 100);
    assert.equal(rows[0].settlement.dueToOrg, 470);
    assert.equal(rows[0].settlement.pendingAmount, 0);
});
