import { isLicensePaymentRow, isLicenseRefund, normalizePaymentMetadata } from './paymentRegistrationMatch.js';

// Shared by the screen and export so a freshly verified report never uses stale React state.
export function buildEventIncomeStatementRows({ settlement, payments = [], refunds = [], interimPayments = [] }) {
    const rows = [];
    for (const p of settlement.receiptRows) {
        const meta = normalizePaymentMetadata(p.metadata);
        rows.push({ id: `cash-${p.reference}`, date: p.created_at, category: 'Entry payment', bucket: '4M Paystack', type: 'payment', description: 'Paystack entry receipt', player: meta.paid_by_name || meta.email || '—', email: meta.email || '', division: meta.division || '', amount: p.amount, status: 'success', method: 'Paystack', reference: p.reference, note: '' });
    }
    for (const rf of [...settlement.processedRefundRows, ...settlement.reservedRefundRows]) rows.push({ id: `refund-${rf.id}`, date: rf.refunded_at || rf.processed_at || rf.created_at, category: rf.status === 'processed' ? 'Entry refund' : 'Refund reserve', bucket: '4M Paystack', type: 'refund', description: 'Paystack entry refund', player: '—', amount: -Math.abs(rf.amount), status: rf.status, method: 'Paystack', reference: rf.receipt.reference });
    for (const allocation of settlement.allocations) {
        if (allocation.holder === '4m') continue;
        const r = allocation.registration;
        rows.push({ id: `allocation-${r.id}`, date: r.created_at, category: allocation.holder === 'club' ? 'Club collection' : allocation.holder === 'comped' ? 'Comped entry' : 'Pending / unpaid', bucket: allocation.holder === 'club' ? 'Club / organiser' : 'Informational', type: allocation.holder === 'pending' ? 'pending' : 'other', description: `${r.division || 'Entry'} — ${allocation.holder === 'club' ? 'Collected by club / organiser' : allocation.holder}`, player: r.full_name || r.email, email: r.email, division: r.division, amount: allocation.amount, status: allocation.holder === 'club' ? 'paid' : allocation.holder, method: allocation.payment?.payment_method || '', reference: allocation.payment?.reference || '' });
    }
    if (settlement.confirmation) rows.push({ id: 'settlement-confirmation', date: settlement.confirmation.confirmed_at, category: 'Confirmed settlement', bucket: 'Settlement adjustment', type: 'other', description: 'Super-admin confirmed settlement adjustment', player: '—', amount: settlement.confirmationAdjustment, status: 'confirmed', method: 'Reconciliation', note: 'Confirmed settlement basis; original payment records retained.' });
    for (const p of payments.filter(isLicensePaymentRow)) rows.push({ id: `lic-${p.id}`, date: p.created_at, category: 'License payment', bucket: '4M retained', type: 'license', description: 'SAPA licence payment', amount: Number(p.amount || 0), status: p.status, method: p.payment_method, reference: p.reference });
    for (const rf of refunds.filter(r => isLicenseRefund(r, payments.find(p => p.id === r.payment_id)))) rows.push({ id: `lic-refund-${rf.id}`, date: rf.processed_at || rf.created_at, category: 'License refund', bucket: '4M retained', type: 'refund', description: 'SAPA licence refund', amount: -Number(rf.amount || 0), status: rf.status, reference: rf.paystack_refund_id });
    rows.push({ id: 'platform-fee', category: 'Platform / commission fee', bucket: '4M retained', type: 'fee', description: 'Platform fee (5% of active entry fees)', amount: -settlement.commission, status: 'processed', note: 'Includes club-paid and unpaid active entries.' });
    for (const p of interimPayments) rows.push({ id: `interim-${p.id}`, date: p.paid_at, category: 'Interim payout', bucket: 'Organiser payout', type: 'interim', description: 'Interim payment to organiser', amount: -Number(p.amount || 0), status: 'processed', note: p.note || '' });
    return rows.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}
