import assert from 'node:assert/strict';
import { belongsToDivision, cancellationRefundStatus } from '../supabase/functions/paystack-refund/division-cancellation.js';
import { resolveRefundableItems, checkRefundEligibility } from '../supabase/functions/paystack-refund/refund-engine.ts';

const division = { id: 'mixed', name: 'Mixed Open' };
const rows = [
    { id: 'a', event_id: 1, email: 'a@example.com', division: 'Mixed Open', division_id: 'mixed' },
    { id: 'b', event_id: 1, email: 'b@example.com', division: 'Mixed Open', division_id: null },
    { id: 'other', event_id: 1, email: 'a@example.com', division: 'Mens Open', division_id: 'mens' },
    { id: 'stale', event_id: 1, email: 'c@example.com', division: 'Mixed Open', division_id: 'different' },
];
const payment = {
    id: 'payment', reference: 'original-payer-reference', amount: 1020, status: 'success',
    metadata: {
        division_entry_fees: { 'Mixed Open': 300, 'Mens Open': 300 },
        covers: [
            { type: 'entry', email: 'a@example.com', division: 'Mixed Open' },
            { type: 'entry', email: 'b@example.com', division: 'Mixed Open' },
            { type: 'entry', email: 'a@example.com', division: 'Mens Open' },
            { type: 'license', email: 'a@example.com', license: 'temporary' },
        ],
    },
};
Deno.test('selects both teammates including legacy rows, excludes other divisions and conflicting IDs', () => {
    assert.deepEqual(rows.filter((r) => belongsToDivision(r, division)).map((r) => r.id), ['a', 'b']);
});
Deno.test('refunds both players from a shared payment while preserving another division and its licence', () => {
    const first = resolveRefundableItems(rows[0], [payment], [], { refundLicense: false });
    assert.equal(first.length, 1);
    assert.equal(first[0].refund_amount_rands, 300);
    const second = resolveRefundableItems(rows[1], [payment], [{ payment_id: payment.id, amount: 300, status: 'processing' }], { refundLicense: true });
    assert.equal(second.length, 1);
    assert.equal(second[0].refund_amount_rands, 300);
    assert.equal(second[0].reference, payment.reference);
    assert.equal(payment.amount - first[0].refund_amount_rands - second[0].refund_amount_rands, 420);
});
Deno.test('refunds temporary licence when the cancelled division was the last entry', () => {
    const items = resolveRefundableItems(rows[0], [payment], [], { refundLicense: true });
    assert.deepEqual(items.map((i) => [i.cover_type, i.refund_amount_rands]), [['entry', 300], ['license', 120]]);
});
Deno.test('existing pending refunds reserve payment balance', () => {
    assert.deepEqual(resolveRefundableItems(rows[0], [payment], [{ payment_id: payment.id, amount: 1020, status: 'pending' }]), []);
});
Deno.test('reports failed and pending refunds without claiming completion', () => {
    assert.equal(cancellationRefundStatus([{ status: 'processing' }]), 'processing');
    assert.equal(cancellationRefundStatus([{ status: 'processing' }, { status: 'needs_attention' }]), 'needs_attention');
    assert.equal(cancellationRefundStatus([{ status: 'skipped:closed' }]), 'needs_attention');
    assert.equal(cancellationRefundStatus([]), 'complete');
});
Deno.test('organiser cancellation can refund after registration closes', () => {
    const result = checkRefundEligibility(rows[0], [{ ...division, entries_close_at: '2020-01-01' }], {}, 'admin@example.com', true);
    assert.equal(result.eligible, true);
});
