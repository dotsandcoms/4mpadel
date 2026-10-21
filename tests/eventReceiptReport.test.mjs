import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateEventSettlement } from '../src/utils/eventSettlement.js';
import { buildEventReceiptReport } from '../src/utils/eventReceiptReport.js';

const reg = (id, extra = {}) => ({ id, full_name: id.toUpperCase(), email: `${id}@example.com`, division: 'Open', division_id: 'open', created_at: '2026-10-01T10:00:00Z', status: 'withdrawn', withdrawn_at: '2026-10-05T10:00:00Z', payment_status: 'paid', ...extra });
const cover = id => ({ type: 'entry', email: `${id}@example.com`, division: 'Open' });
const payment = (id, extra = {}) => ({ id, reference: `REGEV-1-${id}`, amount: 600, status: 'success', payment_type: 'event_entry_fee', payment_method: 'paystack', created_at: '2026-10-01T10:01:00Z', metadata: { email: `${id}@example.com`, covers: [cover(id)] }, ...extra });
const proof = (p, extra = {}) => ({ reference: p.reference, amount: p.amount, paid_at: p.created_at, payer_email: p.metadata.email, verified: true, ...extra });
const report = (data = {}) => {
    const input = { event: { entry_fee: 600 }, divisions: [{ id: 'open', name: 'Open', entry_fee: 600 }], ...data };
    const settlement = calculateEventSettlement(input);
    return { ...buildEventReceiptReport({ ...input, settlement }), settlement };
};

test('a partner-paid team receipt is received once, with one entry share per withdrawal', () => {
    const p = payment('a', { amount: 1200, metadata: { email: 'a@example.com', registrant_name: 'A', covers: [cover('a'), cover('b')] } });
    const refunds = ['a', 'b'].map(id => ({ id: `f-${id}`, event_registration_id: id, payment_id: p.id, status: 'processed', amount: 600, metadata: { cover_type: 'entry' } }));
    const r = report({ registrations: [reg('a'), reg('b')], payments: [p], refunds });
    assert.equal(r.receipts.length, 1); assert.equal(r.receipts[0].amount, 1200); assert.equal(r.receipts[0].refunded, 1200);
    assert.deepEqual(r.withdrawals.map(w => [w.amount, w.refunded, w.retained, w.payerEmail]), [[600, 600, 0, 'a@example.com'], [600, 600, 0, 'a@example.com']]);
});
test('renamed divisions and gateway refund deduplication preserve historical player links', () => {
    const p = payment('a', { metadata: { email: 'a@example.com', covers: [cover('a')], registration_rows: [{ email: 'a@example.com', division: 'Open', division_id: 'open' }] } });
    const refunds = [{ id: 'f', event_registration_id: 'a', payment_id: p.id, paystack_refund_id: '88', status: 'processed', amount: 200, metadata: { cover_type: 'entry' } }];
    const r = report({ registrations: [reg('a', { division: 'Renamed' })], payments: [p], refunds,
        verification: { receipts: [proof(p)], complete: true, gateway_refunds: [{ reference: p.reference, refund_id: '88', amount: 200, status: 'processed', refunded_at: '2026-10-05T14:00:00Z' }] } });
    assert.equal(r.withdrawals[0].amount, 600); assert.equal(r.withdrawals[0].refunded, 200); assert.equal(r.withdrawals[0].retained, 400);
    assert.equal(r.withdrawals[0].refundReferences, '88');
    assert.equal(r.withdrawals[0].refundedAt, '2026-10-05T14:00:00Z');
});
test('re-entry reuses the original receipt without making another receipt or attributing a later charge to the old entry', () => {
    const old = reg('a'); const current = reg('new', { email: old.email, status: 'registered', withdrawn_at: null, created_at: '2026-10-06T10:00:00Z' });
    const p = payment('a');
    const r = report({ registrations: [old, current], payments: [p] });
    assert.equal(r.receipts.length, 1); assert.equal(r.withdrawals[0].applied, 600); assert.equal(r.withdrawals[0].status, 'Applied to current entry');
    const later = report({ registrations: [old, current], payments: [payment('a', { created_at: '2026-10-06T10:01:00Z' })] });
    assert.equal(later.withdrawals[0].amount, 0); assert.equal(later.withdrawals[0].status, 'No receipt linked');
});
test('external Paystack confirmations count once and the verified payer resolves competing claims', () => {
    const admin = id => payment(id, { reference: `MANUAL-ADMIN-${id}`, payment_method: 'eft', metadata: { registration_id: id, email: `${id}@example.com`, note: 'T307051974143572', source: 'manual_event_admin' } });
    const r = report({ registrations: [reg('a'), reg('b')], payments: [admin('b'), admin('a')], verification: { complete: true, receipts: [{ reference: 'T307051974143572', amount: 600, paid_at: '2026-10-01T10:01:00Z', payer_email: 'a@example.com', verified: true }] } });
    assert.equal(r.receipts.length, 1); assert.equal(r.receipts[0].amount, 600);
    assert.equal(r.withdrawals.find(w => w.name === 'A').amount, 600); assert.equal(r.withdrawals.find(w => w.name === 'B').amount, 0);
    assert.equal(r.withdrawals.find(w => w.name === 'A').holder, '4M');
});
test('pending refunds reserve money; licence splits, failed payments and unpaid partners are excluded', () => {
    const p = payment('a', { metadata: { email: 'a@example.com', covers: [cover('a'), { type: 'license', email: 'a@example.com' }], registration_rows: [reg('a'), reg('b')] } });
    const r = report({ registrations: [reg('a'), reg('b')], payments: [p, payment('lic', { payment_type: 'temp_license', amount: 120 }), payment('b', { status: 'failed' })],
        refunds: [{ id: 'f', event_registration_id: 'a', payment_id: p.id, status: 'pending', amount: 200, metadata: { cover_type: 'entry' } }] });
    assert.equal(r.receipts.length, 1); assert.equal(r.receipts[0].amount, 600);
    assert.equal(r.withdrawals.find(w => w.name === 'A').reserved, 200); assert.equal(r.withdrawals.find(w => w.name === 'A').retained, 400);
    assert.equal(r.withdrawals.find(w => w.name === 'B').amount, 0);
});
test('duplicated metadata covers and duplicate raw registrations do not split or duplicate cash', () => {
    const p = payment('a', { amount: 1200, metadata: { email: 'a@example.com', covers: [cover('a'), cover('b')], original_trx: { metadata: { covers: [cover('a'), cover('b')] } } } });
    const r = report({ registrations: [reg('a'), reg('dupe', { email: 'a@example.com', created_at: '2026-09-20' }), reg('b')], payments: [p] });
    assert.equal(r.withdrawals.reduce((n, w) => n + w.amount, 0), 1200);
    assert.equal(r.withdrawals.find(w => w.name === 'A').amount, 600);
});
test('club-confirmed withdrawals remain separate from actual 4M receipts', () => {
    const p = payment('a', { reference: 'MANUAL-ADMIN-a', payment_method: 'eft', metadata: { registration_id: 'a', email: 'a@example.com', note: 'Paid by partner' } });
    const r = report({ registrations: [reg('a')], payments: [p] });
    assert.equal(r.receipts.length, 0); assert.equal(r.withdrawals[0].amount, 600); assert.equal(r.withdrawals[0].holder, 'Club / organiser');
});
test('one club team confirmation preserves both withdrawn players shares without inflating 4M receipts', () => {
    const p = payment('a', { amount: 1200, payment_method: 'eft', metadata: { email: 'a@example.com', covers: [cover('a'), cover('b')] } });
    const r = report({ registrations: [reg('a'), reg('b')], payments: [p] });
    assert.equal(r.receipts.length, 0); assert.equal(r.withdrawals.length, 2);
    assert.deepEqual(r.withdrawals.map(w => [w.amount, w.holder]), [[600, 'Club / organiser'], [600, 'Club / organiser']]);
});
test('an unallocated team refund is visible at receipt level without inventing a player refund share', () => {
    const p = payment('a', { amount: 1200, metadata: { email: 'a@example.com', covers: [cover('a'), cover('b')] } });
    const r = report({ registrations: [reg('a'), reg('b')], payments: [p], verification: {
        complete: true, receipts: [proof(p)], gateway_refunds: [{ reference: p.reference, refund_id: '12', status: 'processed', amount: 600 }],
    } });
    assert.equal(r.receipts[0].refunded, 600); assert.equal(r.receipts[0].retained, 600);
    assert.ok(r.withdrawals.every(w => w.status === 'Refund allocation unresolved' && w.refunded === null && w.retained === null));
});
