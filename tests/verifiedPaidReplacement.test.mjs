import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEventReceiptReport } from '../src/utils/eventReceiptReport.js';
import { calculateEventSettlement } from '../src/utils/eventSettlement.js';
import { findFinancePayment } from '../src/utils/eventFinanceReconciliation.js';
import {
    findPaymentForRegistration, getRegistrationEntryFeePaid, hasVerifiedEntryTransfer,
    paymentEntryCoversFor, resolveRegistrationPayer,
} from '../src/utils/paymentRegistrationMatch.js';
import { paymentCoversRefundEntry, resolveRefundableItems } from '../supabase/functions/paystack-refund/refund-engine.ts';

const payer = {
    id: 'payer-entry', email: 'payer@example.invalid', full_name: 'Original Payer', event_id: 101, division_id: 'open',
    division: 'Open', status: 'registered', payment_status: 'paid', created_at: '2026-10-01T10:00:00Z',
};
const replacement = { ...payer, id: 'paid-slot', email: 'replacement@example.invalid', full_name: 'Replacement Player' };
const former = { ...replacement, id: 'new-entry', email: 'former@example.invalid', full_name: 'Former Player', payment_status: 'pending' };
const unrelated = { ...replacement, id: 'different-entry' };
const payment = {
    id: 'receipt', event_id: 101, player_id: 1, amount: 800, currency: 'ZAR', payment_type: 'event_entry_fee',
    status: 'success', payment_method: 'paystack', reference: 'REGEV-original-provider-reference',
    created_at: '2026-10-01T10:10:00Z', is_test: false,
    metadata: {
        source: 'manual_event', registrant_email: payer.email, registration_id: payer.id,
        division_entry_fees: { Open: 400 },
        line_items: [{ label: 'Original Payer — Open', amount: 400 }, { label: 'Former Player — Open', amount: 400 }],
        covers: [
            { type: 'entry', email: payer.email, division: 'Open' },
            { type: 'license', email: former.email, license: 'temporary' },
            { type: 'entry', email: former.email, division: 'Open' },
        ],
        registration_rows: [{ ...former, id: replacement.id }, payer],
        original_trx: { metadata: { covers: [{ type: 'entry', email: former.email, division: 'Open' }] } },
        verified_entry_transfers: [{ registration_id: replacement.id, event_id: 101,
            cover_position: 2, email: replacement.email, division: 'Open', division_id: 'open' }],
    },
};

test('verified payment follows the exact replacement and leaves canonical checkout and licence untouched', () => {
    const original = structuredClone(payment);
    const covers = paymentEntryCoversFor(payment.metadata);
    assert.deepEqual(covers.map(cover => [cover.type, cover.email]), [
        ['entry', payer.email], ['license', former.email], ['entry', replacement.email],
    ]);
    assert.equal(hasVerifiedEntryTransfer(payment, replacement), true);
    assert.equal(hasVerifiedEntryTransfer(payment, unrelated), false);
    assert.equal(hasVerifiedEntryTransfer(payment, { ...replacement, event_id: 102 }), false);
    assert.equal(hasVerifiedEntryTransfer(payment, { ...replacement, division_id: 'other' }), false);
    assert.equal(findFinancePayment([payment], replacement), payment);
    assert.equal(findPaymentForRegistration([payment], former), null);
    assert.equal(findPaymentForRegistration([payment], unrelated), null);
    assert.deepEqual(resolveRegistrationPayer(payment, replacement), { payerEmail: payer.email, isPartnerPaid: true });
    assert.equal(getRegistrationEntryFeePaid(payment, replacement), 400);
    assert.equal(getRegistrationEntryFeePaid(payment, { ...replacement, division: 'Renamed Open' }, 999), 400);
    assert.deepEqual(payment, original);
});

test('original money is settled once and the withdrawn replacement appears on the original payer receipt', () => {
    const event = { id: 101, entry_fee: 400 };
    const divisions = [{ id: 'open', name: 'Open', entry_fee: 400 }];
    const settlement = calculateEventSettlement({ event, divisions, registrations: [payer, replacement, former], payments: [payment] });
    assert.equal(settlement.receiptRows.length, 1);
    assert.equal(settlement.paid4M, 2);
    assert.equal(settlement.collected4M, 800);
    assert.equal(settlement.allocations.find(item => item.registration.id === former.id).holder, 'pending');

    const registrations = [payer, { ...replacement, status: 'withdrawn', withdrawn_at: '2026-11-01T10:00:00Z' }, former];
    const input = { event, divisions, registrations, payments: [payment] };
    const report = buildEventReceiptReport({ ...input, settlement: calculateEventSettlement(input) });
    const withdrawn = report.withdrawals.find(row => row.name === replacement.full_name);
    assert.equal(withdrawn.amount, 400);
    assert.equal(withdrawn.payerEmail, payer.email);
    assert.equal(withdrawn.reference, payment.reference);
});

test('refund engine uses the immutable reference and matches only the transferred entry', () => {
    assert.equal(paymentCoversRefundEntry(payment, replacement), true);
    assert.equal(paymentCoversRefundEntry(payment, former), false);
    assert.equal(paymentCoversRefundEntry(payment, unrelated), false);
    assert.equal(paymentCoversRefundEntry(payment, { ...replacement, event_id: 102 }), false);
    assert.deepEqual(resolveRefundableItems(replacement, [payment], []), [{
        payment_id: payment.id, reference: payment.reference, refund_amount_rands: 400,
        cover_type: 'entry', already_refunded_rands: 0, is_test: false,
    }]);
    assert.deepEqual(resolveRefundableItems(former, [payment], [], { refundLicense: false }), []);
    assert.deepEqual(resolveRefundableItems(replacement, [payment], [{ payment_id: payment.id, amount: 800, status: 'processing' }]), []);
});

test('two redacted transfers in the same division remain distinct in receipts and refunds', () => {
    const { email: _privateContact, ...redacted } = payment.metadata.verified_entry_transfers[0];
    const first = { ...payer, email:'another-replacement@example.invalid', full_name:'Other replacement' };
    const receipt = { ...payment, metadata: { ...payment.metadata, verified_entry_transfers:[redacted, {
        registration_id:first.id, event_id:first.event_id, cover_position:1, division:first.division, division_id:first.division_id,
    }] } };
    const registrations = [first, replacement].map(row => ({...row, status:'withdrawn', withdrawn_at:'2026-11-01T10:00:00Z'}));
    const input = { event:{id:101, entry_fee:400}, divisions:[{id:'open',name:'Open',entry_fee:400}], registrations, payments:[receipt] };
    const report = buildEventReceiptReport({ ...input, settlement:calculateEventSettlement(input) });
    assert.deepEqual(report.withdrawals.map(row=>[row.name,row.amount]).sort(), [
        [first.full_name,400], [replacement.full_name,400],
    ]);
    assert.equal(resolveRefundableItems(first,[receipt],[])[0]?.refund_amount_rands,400);
    assert.equal(resolveRefundableItems(replacement,[receipt],[])[0]?.reference,payment.reference);
    assert.equal(findPaymentForRegistration([receipt],former),null);
    assert.equal(findPaymentForRegistration([receipt],unrelated),null);
});


test('a partial division refund reduces only the exact entry component on a bundled receipt', () => {
    const refund = (registration, amount, status, cover_type) => ({
        payment_id: payment.id, event_registration_id: registration.id, amount, status,
        metadata: cover_type ? { cover_type } : {},
    });
    const priorRefunds = [
        refund(replacement, 100, 'processing', 'entry'),
        refund(replacement, 40, 'needs_attention'),
        refund(replacement, 300, 'failed', 'entry'),
        refund(replacement, 20, 'processed', 'license'),
        refund(payer, 100, 'processed', 'entry'),
    ];
    const entryOnly = { refundLicense: false };
    assert.deepEqual(resolveRefundableItems(replacement, [payment], priorRefunds, entryOnly), [{
        payment_id: payment.id, reference: payment.reference, refund_amount_rands: 260,
        cover_type: 'entry', already_refunded_rands: 260, is_test: false,
    }]);
    assert.equal(resolveRefundableItems(payer, [payment], priorRefunds, entryOnly)[0]?.refund_amount_rands, 300);

    const duplicate = { ...payment, id: 'another-receipt', reference: 'duplicate-reference' };
    assert.equal(resolveRefundableItems(replacement, [payment, duplicate], priorRefunds, entryOnly)[0]?.payment_id, payment.id);
    assert.deepEqual(resolveRefundableItems(replacement, [payment, duplicate], [
        ...priorRefunds, refund(replacement, 260, 'processed', 'entry'),
    ], entryOnly), []);
});
