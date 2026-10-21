import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateEventSettlement, loadEventCashVerification } from '../src/utils/eventSettlement.js';

const reg = (id, extra = {}) => ({ id, email: `${id}@example.com`, division: 'Open', division_id: 'open', status: 'registered', payment_status: 'paid', ...extra });
const pay = (id, extra = {}) => ({ id, reference: `REGEV-1-${id}`, amount: 600, status: 'success', payment_method: 'paystack', payment_type: 'event_entry_fee', metadata: { covers: [{ type: 'entry', email: `${id}@example.com`, division: 'Open' }] }, ...extra });
const admin = (id, method = 'eft', note = '') => pay(`admin-${id}`, { reference: `MANUAL-ADMIN-${id}`, payment_method: method, metadata: { source: 'manual_event_admin', registration_id: id, email: `${id}@example.com`, note } });
const proof = (reference, amount = 600, extra = {}) => ({ reference, amount, status: 'success', verified: true, ...extra });
const calc = extra => calculateEventSettlement({ event: { id: 1, entry_fee: 600 }, ...extra });

test('all active invoices form the fee base; EFT and unpaid entries never inflate 4M cash', () => {
    const r = calc({ registrations: [reg('a'), reg('b'), reg('c', { payment_status: 'pending' })], payments: [pay('a'), admin('b')] });
    assert.equal(r.totalAmountBilled, 1800);
    assert.equal(r.netHeld4M, 600); assert.equal(r.collectedManual, 600); assert.equal(r.pendingAmount, 600);
    assert.equal(r.commission, 90); assert.equal(r.dueToOrg, 510);
});
test('external Paystack receipts count even when recorded with an EFT method', () => {
    const r = calc({ registrations: [reg('a')], payments: [admin('a', 'eft', 'Paid T307051974143572')], verification: { receipts: [proof('T307051974143572')], complete: true } });
    assert.equal(r.netHeld4M, 600); assert.equal(r.collectedManual, 0); assert.equal(r.paid4M, 1);
});
test('manual confirmations of existing cash are not new cash', () => {
    const r = calc({ registrations: [reg('a')], payments: [pay('a'), admin('a', 'paystack', 'Original entry paid; re-added with partner')] });
    assert.equal(r.collected4M, 600); assert.equal(r.receiptRows.length, 1);
});
test('one shared external reference can fund only one R600 entry', () => {
    const r = calc({ registrations: [reg('b'), reg('a')], payments: [admin('a', 'manual', 'T396848386071945'), admin('b', 'manual', 'T396848386071945')], verification: { receipts: [proof('T396848386071945', 600, { payer_email: 'a@example.com' })], complete: true } });
    assert.equal(r.netHeld4M, 600); assert.equal(r.paid4M, 1); assert.equal(r.pendingCount, 1);
    assert.equal(r.allocations.find(a => a.registration.id === 'a').holder, '4m');
    assert.ok(r.issues.some(i => i.includes('Multiple entry confirmations')));
});
test('genuine extra charges remain cash held, without inflating the entry-fee base', () => {
    const r = calc({ registrations: [reg('a')], payments: [pay('a'), pay('second', { metadata: { email: 'a@example.com' } })] });
    assert.equal(r.collected4M, 1200); assert.equal(r.totalAmountBilled, 600); assert.equal(r.commission, 30); assert.equal(r.dueToOrg, 1170);
});
test('gateway and recorded refunds with the same provider ID are counted once; licence refunds stay separate', () => {
    const p = pay('a', { amount: 1200 });
    const r = calc({ registrations: [reg('a')], payments: [p, pay('lic', { payment_type: 'temp_license', amount: 120 })],
        refunds: [{ id: 'f', payment_id: 'a', amount: 600, status: 'processed', paystack_refund_id: '8', metadata: { cover_type: 'entry' } },
            { id: 'l', payment_id: 'lic', amount: 120, status: 'processed', paystack_refund_id: '9', metadata: { cover_type: 'license' } }],
        verification: { receipts: [proof(p.reference, 1320)], gateway_refunds: [{ reference: p.reference, refund_id: '8', amount: 600, status: 'processed' }, { reference: p.reference, refund_id: '9', amount: 120, status: 'processed' }], complete: true } });
    assert.equal(r.collected4M, 1200); assert.equal(r.entryFeesRefunded, 600); assert.equal(r.netHeld4M, 600);
});
test('a Paystack refund missing from the local ledger still reduces held funds', () => {
    const p = pay('a');
    const r = calc({ registrations: [reg('a')], payments: [p], verification: { reversals: [proof(p.reference)], gateway_refunds: [{ reference: p.reference, refund_id: '8', amount: 600, status: 'processed' }], complete: true } });
    assert.equal(r.netHeld4M, 0); assert.equal(r.entryFeesRefunded, 600);
});
test('pending refunds are reserved rather than reported as processed', () => {
    const r = calc({ registrations: [reg('a')], payments: [pay('a')], refunds: [{ id: 'f', payment_id: 'a', amount: 200, status: 'processing', metadata: { cover_type: 'entry' } }] });
    assert.equal(r.entryFeesRefunded, 0); assert.equal(r.refundReserve, 200); assert.equal(r.netHeld4M, 400);
});
test('old refunded Paystack cash does not make a new club-paid entry into 4M cash', () => {
    const r = calc({ registrations: [reg('a')], payments: [pay('a'), admin('a', 'manual', 'Card payment at club')], refunds: [{ id: 'f', payment_id: 'a', amount: 600, status: 'processed', metadata: { cover_type: 'entry' } }] });
    assert.equal(r.netHeld4M, 0); assert.equal(r.paidClub, 1); assert.equal(r.collectedManual, 600);
});
test('test receipts, failed receipts, licences and complimentary entries do not create entry cash', () => {
    const r = calc({ registrations: [reg('a'), reg('free')], payments: [pay('test', { is_test: true }), pay('fail', { status: 'failed' }), pay('lic', { payment_type: 'membership', amount: 450 }), pay('free', { metadata: { registration_id: 'free', comp_entry: true }, amount: 0 })] });
    assert.equal(r.netHeld4M, 0); assert.equal(r.compedEntries, 1); assert.equal(r.totalAmountBilled, 600);
});
test('confirmed settlement is explicit, retains calculated evidence and applies only to its unchanged invoice snapshot', () => {
    const confirmation = { version: 1, entry_count: 200, total_billed: 120000, held_by_4m: 118200, club_collected: 600, outstanding: 1200, unpaid_count: 2, paystack_entry_count: 197, club_entry_count: 1 };
    const registrations = Array.from({ length: 200 }, (_, i) => reg(String(i)));
    const r = calc({ event: { id: 479, entry_fee: 600, organiser_settlement_confirmation: confirmation }, registrations });
    assert.equal(r.netHeld4M, 118200); assert.equal(r.commission, 6000); assert.equal(r.dueToOrg, 112200);
    assert.equal(r.calculated.netHeld4M, 0); assert.equal(r.confirmationAdjustment, 118200);
    assert.equal(calc({ registrations }).confirmation, null);
    assert.equal(calc({ event: { entry_fee: 600, organiser_settlement_confirmation: confirmation }, registrations: registrations.slice(1) }).confirmation, null);
});
test('duplicate pending registrations and withdrawn entries do not inflate the billed tiers or commission', () => {
    const r = calc({ registrations: [reg('a'), reg('duplicate', { email: 'a@example.com', payment_status: 'pending', division: 'Renamed' }), reg('withdrawn', { status: 'withdrawn' })], divisions: [{ id: 'open', name: 'Renamed', entry_fee: 800 }], payments: [pay('a')] });
    assert.equal(r.activeEntries, 1); assert.equal(r.totalAmountBilled, 600); assert.equal(r.billedTierBreakdown[0].count, 1);
});
test('interim payouts are subtracted after entry-based commission', () => {
    const r = calc({ registrations: [reg('a')], payments: [pay('a')], interimPayments: [{ amount: 100 }] });
    assert.equal(r.dueToOrg, 470);
});
test('verified success overrides an abandoned local checkout; a gateway failure overrides stale success', () => {
    const p = pay('a', { status: 'abandoned' });
    const r = calc({ registrations: [reg('a')], payments: [p], verification: { receipts: [proof(p.reference)], complete: true } });
    assert.equal(r.netHeld4M, 600); assert.equal(r.paid4M, 1);
    const failed = calc({ registrations: [reg('a')], payments: [pay('a')], verification: { non_receipts: [{ reference: p.reference }], complete: true } });
    assert.equal(failed.netHeld4M, 0);
});
test('cash verification consumes all batches and fails visibly if a batch is unavailable', async () => {
    const client = { functions: { invoke: async (_name, { body }) => ({ data: { receipts: [proof(`batch-${body.offset}`)], next_offset: body.offset === 0 ? 40 : null } }) } };
    const r = await loadEventCashVerification(client, 1);
    assert.equal(r.receipts.length, 2); assert.equal(r.complete, true);
    const bad = await loadEventCashVerification({ functions: { invoke: async () => ({ error: new Error('offline') }) } }, 1);
    assert.equal(bad.complete, false); assert.equal(bad.unresolved.length, 1);
});
