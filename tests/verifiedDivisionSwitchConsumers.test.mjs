import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFinanceAllocations, findFinancePayment } from '../src/utils/eventFinanceReconciliation.js';
import { buildEventIncomeLines } from '../src/utils/eventIncomeStatement.js';
import { buildEventReceiptReport } from '../src/utils/eventReceiptReport.js';
import { calculateEventSettlement } from '../src/utils/eventSettlement.js';
import { findPaymentForRegistration, getRegistrationEntryFeePaid, paymentMatchesRegistration } from '../src/utils/paymentRegistrationMatch.js';
import { entryBalance } from '../mobile/supabase/functions/native-entry-balance/balance.ts';
import { pendingBadgeCount } from '../mobile/supabase/functions/_shared/app-badge.ts';
import { resolveRefundableItems } from '../supabase/functions/_shared/refund-engine.ts';

const event = { id: 17, entry_fee: 425, start_date: '2035-03-01' };
const source = { id: 'open', event_id: 17, name: 'Open', entry_fee: 425 };
const target = { id: 'advanced', event_id: 17, name: 'Advanced', entry_fee: 525 };
const reg = { id: 'moved-slot', email: 'player@example.invalid', full_name: 'Fixture Player', event_id: 17,
    division: target.name, division_id: target.id, payment_status: 'paid', status: 'registered' };
const partner = { ...reg, id: 'team-mate', email: 'partner@example.invalid', full_name: 'Fixture Partner',
    division: source.name, division_id: source.id };
const base = { id: 'base', event_id: 17, amount: 800, reference: 'EVREG-FIXTURE-1', status: 'success',
    payment_type: 'event_entry_fee', payment_method: 'paystack', created_at: '2034-12-01T00:00:00Z',
    metadata: { source: 'manual_event', email: reg.email, division_entry_fees: { Open: 400 },
        covers: [reg, partner].map(row => ({ type: 'entry', email: row.email, division: source.name, division_id: source.id })),
        verified_entry_transfers: [{ cover_position: 1, registration_id: reg.id, event_id: 17, division: target.name,
            division_id: target.id, original_division: source.name, original_division_id: source.id }] } };
const switched = { ...base, id: 'top-up', amount: 100, reference: 'MSWITCH-SUCCESS', created_at: '2034-12-02T00:00:00Z',
    metadata: { source: 'division_switch', email: reg.email, registration_id: reg.id, target_division_id: target.id,
        verified_division_switch: { registration_id: reg.id, event_id: 17, division: target.name,
            division_id: target.id, from_division_id: source.id, amount: 100 } } };
const { verified_division_switch: allocation, ...legacyMetadata } = switched.metadata;
const unapplied = { ...switched, id: 'unapplied', reference: 'MSWITCH-UNAPPLIED',
    metadata: { ...legacyMetadata, switch_completed: true } };
const settle = (payments, refunds = [], registrations = [reg, partner]) =>
    calculateEventSettlement({ event, registrations, divisions: [source, target], payments, refunds });

test('verified division charges add to the original entry and leave unapplied cash in receipt history', () => {
    const payments = [unapplied, switched, base];
    const settlement = settle(payments);
    const move = settlement.allocations.find(row => row.registration.id === reg.id);
    assert.equal(findFinancePayment(payments, reg), base);
    assert.equal(findPaymentForRegistration(payments, reg), base);
    assert.equal(getRegistrationEntryFeePaid(switched, reg, 525), 100);
    assert.equal(getRegistrationEntryFeePaid(unapplied, reg, 525), 0);
    assert.equal(paymentMatchesRegistration(unapplied, reg), false);
    assert.equal(move.amount, 500);
    assert.deepEqual(move.shares.map(row => [row.receipt.id, row.amount]), [['top-up', 100], ['base', 400]]);
    assert.equal(settlement.totalAmountBilled, 900);
    assert.equal(settlement.collected4M, 900);
    assert.equal(settlement.cashHistory.collected4M, 1000);
    assert.equal(settlement.unallocatedCash4M, 100);
    assert.equal(settlement.dueToOrg, 855);
    assert.deepEqual(buildFinanceAllocations([reg, partner], payments).map(row => [row.payment.id, row.registration?.id, row.amount]),
        [['unapplied', undefined, 100], ['top-up', reg.id, 100], ['base', reg.id, 400], ['base', partner.id, 400]]);
    const report = buildEventReceiptReport({ registrations: [reg, partner], divisions: [source, target], settlement });
    assert.equal(report.receipts.find(row => row.reference === switched.reference).players, reg.full_name);
    assert.equal(report.receipts.find(row => row.reference === unapplied.reference).players, '');
    const lines = buildEventIncomeLines({ event, registrations: [reg, partner], payments, refunds: [], reportStats: settlement });
    assert.equal(lines.find(row => row.reference === switched.reference).registrationId, reg.id);
    assert.equal(lines.find(row => row.reference === unapplied.reference).registrationId, null);
});

test('an allocated top-up refund preserves the other entry share and an unapplied refund does not change the current invoice', () => {
    const refund = (id, payment, status = 'processing') => ({ id, payment_id: payment.id, event_registration_id: reg.id,
        amount: 100, status, metadata: { cover_type: 'entry' } });
    const result = settle([switched, unapplied, base], [refund('reserve', switched), refund('historical', unapplied, 'processed')]);
    assert.equal(result.refundReserve, 100);
    assert.equal(result.pendingAmount, 0);
    assert.equal(result.collected4M, 800);
    assert.equal(result.dueToOrg, 760);
    assert.equal(result.allocations.find(row => row.registration.id === reg.id).refundPending, 100);
    assert.equal(result.allocations.find(row => row.registration.id === reg.id).refunded, 0);
    assert.equal(result.allocations.find(row => row.registration.id === partner.id).shares[0].amount, 400);
    const archived = { ...reg, status: 'withdrawn', division_id: null, division: `__archived__/${reg.id}` };
    const archivedRefund = refund('archived', switched, 'processed');
    const history = settle([switched, base], [archivedRefund], [archived, partner]);
    const report = buildEventReceiptReport({ registrations: [archived, partner], divisions: [source, target], refunds: [archivedRefund], settlement: history });
    const receipt = report.withdrawals.find(row => row.reference === switched.reference);
    assert.equal(receipt.registrationId, reg.id);
    assert.equal(receipt.amount, 100);
    assert.equal(receipt.refunded, 100);
});

test('a reserved price adjustment reduces the exact slot balance and survives a later withdrawal', () => {
    const reservation = { id: 'switch-refund', payment_id: base.id, event_registration_id: reg.id, amount: 150,
        status: 'failed', metadata: { cover_type: 'entry', verified_switch_reservation: true } };
    const recorded = { ...base, metadata: { ...base.metadata, verified_entry_switch_refunds: [
        { registration_id: reg.id, event_id: reg.event_id, division_id: reg.division_id, amount: 150 },
    ] } };
    assert.equal(entryBalance(event, target, reg, [recorded, switched]).paid, 350);
    assert.equal(entryBalance(event, source, partner, [recorded, switched]).paid, 400);
    const result = settle([recorded, switched, unapplied], [reservation]);
    assert.equal(result.refundReserve, 150);
    assert.equal(result.allocations.find(row => row.registration.id === partner.id).shares[0].amount, 400);
    const items = resolveRefundableItems(reg, [recorded, switched, unapplied], [reservation], { refundLicense: false });
    assert.deepEqual(items.map(item => [item.reference, item.refund_amount_rands]), [[base.reference, 250], [switched.reference, 100]]);
    assert.deepEqual(resolveRefundableItems(partner, [recorded, switched], [reservation], { refundLicense: false })
        .map(item => [item.reference, item.refund_amount_rands]), [[base.reference, 400]]);
});

test('mobile entry balance and badge only count the database attestation for the same current slot', () => {
    const early = { ...event, early_bird_fee: 400, early_bird_ends_at: '2000-01-01T00:00:00Z' };
    const fitting = { ...switched, amount: 125, metadata: { ...switched.metadata, verified_division_switch: { ...allocation, amount: 125 } } };
    const invalid = [
        unapplied,
        { ...switched, event_id: 18 },
        { ...switched, amount: 50 },
        { ...switched, is_test: true },
        { ...switched, status: 'processing' },
        { ...switched, metadata: { ...switched.metadata, verified_division_switch: { ...allocation, registration_id: 'other-slot' } } },
        { ...switched, metadata: { ...switched.metadata, verified_division_switch: { ...allocation, division_id: source.id } } },
    ];
    assert.ok(invalid.every(receipt => !paymentMatchesRegistration(receipt, reg)));
    assert.equal(entryBalance(event, target, reg, [base, ...invalid]).due, 125);
    assert.deepEqual(entryBalance(event, target, reg, [base, fitting, ...invalid]), {
        registrationId: reg.id, division: target.name, known: true, paid: 525, price: 525, due: 0,
    });
    assert.deepEqual(entryBalance(early, target, reg, [base, switched]), {
        registrationId: reg.id, division: target.name, known: true, paid: 500, price: 500, due: 0,
    });
    const player = { email: reg.email, region: 'Gauteng', racket_brand: 'Fixture' };
    const now = new Date('2035-02-10T00:00:00Z');
    assert.equal(pendingBadgeCount(player, [reg], [event], [target], [base, ...invalid], now), 1);
    assert.equal(pendingBadgeCount(player, [reg], [event], [target], [base, fitting, ...invalid], now), 0);
});

test('several completed top-ups follow the slot while the oldest original receipt prices the base', () => {
    const destination = { id: 'elite', event_id: 17, name: 'Elite', entry_fee: 575 };
    const moved = { ...reg, division_id: destination.id, division: destination.name };
    const movedBase = { ...base, metadata: { ...base.metadata, verified_entry_transfers: [{
        ...base.metadata.verified_entry_transfers[0], division_id: destination.id, division: destination.name,
    }] } };
    const first = { ...switched, metadata: { ...switched.metadata, verified_division_switch: {
        ...allocation, division_id: destination.id, division: destination.name,
    } } };
    const second = { ...first, id: 'second', reference: 'SWITCH-SECOND', amount: 50,
        metadata: { ...first.metadata, verified_division_switch: {
            ...first.metadata.verified_division_switch, from_division_id: target.id, amount: 50,
        } } };
    const duplicate = { ...movedBase, id: 'another-base', reference: 'EVREG-OTHER-BASE',
        amount: 900, created_at: '2034-12-10T00:00:00Z',
        metadata: { ...movedBase.metadata, division_entry_fees: { Open: 450 } } };
    const payments = [second, first, duplicate, movedBase];
    assert.equal(findFinancePayment(payments, moved), movedBase);
    assert.equal(paymentMatchesRegistration(first, reg), false);
    assert.equal(paymentMatchesRegistration(first, moved), true);
    const settlement = calculateEventSettlement({ event, registrations: [moved], divisions: [destination], payments });
    assert.equal(settlement.totalAmountBilled, 550);
    assert.equal(settlement.collected4M, 550);
    assert.equal(settlement.unallocatedCash4M, 1300);
    assert.equal(entryBalance(event, destination, moved, [second, first, movedBase]).paid, 550);
});
