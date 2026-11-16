import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveRegistrationPayer, paymentPayerEmailFor, registrationIsCompedEntry } from '../src/utils/paymentRegistrationMatch.js';
import { calculateEventSettlement } from '../src/utils/eventSettlement.js';
import { buildEventReceiptReport } from '../src/utils/eventReceiptReport.js';

const registration = { id: 'partner', email: 'partner@example.com', full_name: 'Partner', division: 'Open', status: 'registered', payment_status: 'paid', registered_by: 'admin@example.com' };
const payment = { id: 'manual', reference: 'MANUAL-ADMIN-partner', amount: 800, status: 'success', payment_type: 'event_entry_fee', payment_method: 'manual', metadata: {
    source: 'manual_event_admin', registration_id: registration.id, email: registration.email, division: 'Open',
    collection_recipient: 'organiser', collection_recipient_name: 'VAPC', paid_by_email: 'payer@example.com', paid_by_name: 'Payer', note: 'Paid In-store',
} };

test('an explicitly recorded offline partner payer remains distinct from the covered player and club recipient', () => {
    assert.deepEqual(resolveRegistrationPayer(payment, registration), { isPartnerPaid: true, payerEmail: 'payer@example.com' });
    const settlement = calculateEventSettlement({ registrations: [registration], payments: [payment], event: { entry_fee: 800 } });
    assert.equal(settlement.paidClub, 1);
    assert.equal(settlement.collectedOrganiser, 800);
    assert.equal(settlement.collected4M, 0);
    assert.equal(settlement.commission, 0);
    assert.equal(settlement.pendingCount, 0);
    assert.equal(paymentPayerEmailFor({ ...payment, metadata: { ...payment.metadata, registrant_email: registration.email } }), 'payer@example.com');
});

test('an admin or booking creator is never inferred to be the payer without explicit payer metadata', () => {
    const metadata = { ...payment.metadata };
    delete metadata.paid_by_email;
    delete metadata.paid_by_name;
    assert.deepEqual(resolveRegistrationPayer({ ...payment, metadata }, registration), { isPartnerPaid: false, payerEmail: null });
    assert.deepEqual(resolveRegistrationPayer(payment, { ...registration, id: 'different', email: 'different@example.com' }), { isPartnerPaid: false, payerEmail: null });
});

test('withdrawn club payments retain the actual partner payer in historical exports', () => {
    const old = { ...registration, status: 'withdrawn' };
    const settlement = calculateEventSettlement({ registrations: [old], payments: [payment] });
    const report = buildEventReceiptReport({ registrations: [old], settlement });
    assert.equal(report.withdrawals[0].payerEmail, 'payer@example.com');
    assert.equal(report.withdrawals[0].payerName, 'Payer');
    assert.equal(report.withdrawals[0].holder, 'Club / organiser');
    assert.equal(report.receipts.length, 0);
});

test('a sponsored Open entry cannot comp the same player’s pending Intermediate entry', () => {
    const open = { ...registration, id: 'sponsored', division: 'Open' };
    const intermediate = { ...registration, id: 'pending', division: 'Intermediate', payment_status: 'pending' };
    const comp = { ...payment, amount: 0, metadata: { source: 'admin_add_player', registration_id: open.id, email: open.email, division: 'Open', free_entry: true } };
    assert.equal(registrationIsCompedEntry(open, [comp]), true);
    assert.equal(registrationIsCompedEntry(intermediate, [comp]), false);
    const s = calculateEventSettlement({ event: { entry_fee: 800 }, registrations: [open, intermediate], payments: [comp] });
    assert.equal(s.compedEntries, 1);
    assert.equal(s.pendingAmount, 800);
});

test('a later cash confirmation supersedes an older comp on the same registration', () => {
    const comp = { ...payment, amount: 0, created_at: '2026-10-18T12:00:00Z', metadata: { ...payment.metadata, free_entry: true } };
    const paid = { ...payment, created_at: '2026-10-19T12:00:00Z' };
    assert.equal(registrationIsCompedEntry(registration, [comp, paid]), false);
    assert.equal(registrationIsCompedEntry(registration, [paid, comp]), false);
    assert.equal(registrationIsCompedEntry(registration, [{ ...comp, created_at: '2026-10-20T12:00:00Z' }, paid]), true);
});

test('an accepted entry with a promised 4M payment counts as an entry and receivable, with no cash or commission until receipt', () => {
    const expected = { ...payment, status: 'pending', metadata: { ...payment.metadata, collection_recipient: '4m', payment_expected: true } };
    const s = calculateEventSettlement({ event: { entry_fee: 800 }, registrations: [registration], payments: [expected] });
    assert.equal(s.activeEntries, 1);
    assert.equal(s.pendingAmount, 800);
    assert.equal(s.collected4M, 0);
    assert.equal(s.commission, 0);
    assert.equal(s.dueToOrg, 0);
    assert.deepEqual(s.issues, []);
    const paid = calculateEventSettlement({ event: { entry_fee: 800 }, registrations: [registration], payments: [{ ...expected, status: 'success' }] });
    assert.deepEqual([paid.collected4M, paid.pendingAmount, paid.commission, paid.dueToOrg], [800, 0, 40, 760]);
});
