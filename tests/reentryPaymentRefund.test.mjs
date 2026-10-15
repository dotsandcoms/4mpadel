import test from 'node:test';
import assert from 'node:assert/strict';
import { hasBlockingProcessedRefund, registrationCountsAsPaid } from '../src/utils/paymentRegistrationMatch.js';

const registration = {
    id: 'entry', event_id: 516, email: 'player@example.com',
    division: 'Ladies Intermediate', status: 'registered', payment_status: 'paid',
};
const payment = (overrides = {}) => ({
    id: 'new-payment', reference: 'NEW', event_id: 516, status: 'success',
    payment_type: 'event_entry_fee', created_at: '2026-10-06T12:56:16Z',
    metadata: { covers: [{ type: 'entry', email: registration.email, division: registration.division }] },
    ...overrides,
});
const refund = (overrides = {}) => ({
    payment_id: 'old-payment', paystack_reference: 'OLD', event_registration_id: registration.id,
    status: 'processed', metadata: { cover_type: 'entry' },
    created_at: '2026-10-06T12:54:22Z', processed_at: '2026-10-06T13:25:04Z',
    ...overrides,
});
const refundMap = (...rows) => new Map([[registration.id, { rows }]]);

test('a separate repayment before an earlier refund callback still counts as paid', () => {
    assert.equal(hasBlockingProcessedRefund(registration, refundMap(refund()), [payment()]), false);
    assert.equal(registrationCountsAsPaid(registration, refundMap(refund()), [payment()]), true);
});

test('the refunded charge cannot count as its own repayment, even if backfilled later', () => {
    const old = payment({ id: 'old-payment', reference: 'OLD', created_at: '2026-10-07T12:00:00Z' });
    assert.equal(hasBlockingProcessedRefund(registration, refundMap(refund()), [old]), true);
    assert.equal(hasBlockingProcessedRefund(registration, refundMap(refund({ payment_id: null })), [old]), true);
});

test('a repayment that was also refunded remains blocked', () => {
    const second = refund({ payment_id: 'new-payment', paystack_reference: 'NEW', created_at: '2026-10-07T12:00:00Z' });
    assert.equal(hasBlockingProcessedRefund(registration, refundMap(refund(), second), [payment()]), true);
});

test('pending, license, partner and other-event payments cannot supersede an entry refund', () => {
    const candidates = [
        payment({ status: 'pending' }),
        payment({ payment_type: 'temp_license' }),
        payment({ metadata: { covers: [{ type: 'entry', email: 'partner@example.com', division: registration.division }] } }),
        payment({ event_id: 999 }),
    ];
    for (const candidate of candidates) {
        assert.equal(hasBlockingProcessedRefund(registration, refundMap(refund()), [candidate]), true);
    }
});

test('a payment made before withdrawal does not supersede its refund', () => {
    assert.equal(hasBlockingProcessedRefund(registration, refundMap(refund()), [payment({ created_at: '2026-10-05T12:00:00Z' })]), true);
});

test('refunds with no linked charge retain the conservative processing-time cutoff', () => {
    const unlinked = refund({ payment_id: null, paystack_reference: null });
    assert.equal(hasBlockingProcessedRefund(registration, refundMap(unlinked), [payment()]), true);
    assert.equal(hasBlockingProcessedRefund(registration, refundMap(unlinked), [payment({ created_at: '2026-10-07T12:00:00Z' })]), false);
});

test('license and failed refunds do not block the current entry', () => {
    assert.equal(hasBlockingProcessedRefund(registration, refundMap(refund({ metadata: { cover_type: 'license' } })), []), false);
    assert.equal(hasBlockingProcessedRefund(registration, refundMap(refund({ status: 'failed' })), []), false);
});

test('withdrawn or pending entries remain unpaid despite a replacement payment', () => {
    assert.equal(registrationCountsAsPaid({ ...registration, status: 'withdrawn' }, refundMap(refund()), [payment()]), false);
    assert.equal(registrationCountsAsPaid({ ...registration, payment_status: 'pending' }, refundMap(refund()), [payment()]), false);
});
