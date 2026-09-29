import {
    findPaymentForRegistration, getRegistrationEntryFeePaid, isLicensePaymentRow,
    isCompedEntryPayment, normalizePaymentMetadata, paymentStrictlyCoversRegistration,
} from './paymentRegistrationMatch.js';

// Financial reports must not attach an old checkout to a replacement registration.
export function findFinancePayment(payments, reg, refunds = []) {
    if (reg.status === 'withdrawn') {
        const refund = refunds.find((r) => r.event_registration_id === reg.id && r.status !== 'failed'
            && normalizePaymentMetadata(r.metadata).cover_type !== 'license');
        const original = refund && payments.find((p) => p.id === refund.payment_id && p.status === 'success' && !isLicensePaymentRow(p));
        if (original) return original;
    }
    const candidates = (payments || []).filter((p) => {
        const meta = normalizePaymentMetadata(p.metadata);
        return p.status === 'success' && !isLicensePaymentRow(p)
            && (!meta.registration_id || meta.registration_id === reg.id);
    });
    const latest = (rows) => [...rows].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0] || null;
    const direct = latest(candidates.filter((p) => normalizePaymentMetadata(p.metadata).registration_id === reg.id));
    if (direct) return direct;
    const strict = latest(candidates.filter((p) => paymentStrictlyCoversRegistration(p, reg)));
    if (strict) return strict;
    // An unpaid withdrawn row cannot borrow a different division's payment.
    if (reg.status === 'withdrawn' || reg.payment_status === 'pending') return null;
    return findPaymentForRegistration(candidates, reg);
}

export function buildFinanceAllocations(registrations, payments, refunds = []) {
    const byPayment = new Map();
    for (const reg of registrations) {
        const historicalRefund = reg.status === 'withdrawn'
            ? refunds.find((r) => r.event_registration_id === reg.id && r.status !== 'failed'
                && normalizePaymentMetadata(r.metadata).cover_type !== 'license') : null;
        const payment = (historicalRefund && payments.find((p) => p.id === historicalRefund.payment_id))
            || findFinancePayment(payments, reg);
        if (!payment || isLicensePaymentRow(payment) || isCompedEntryPayment(payment)) continue;
        const amount = getRegistrationEntryFeePaid(payment, reg, 0);
        if (amount <= 0) continue;
        const list = byPayment.get(payment.id) || [];
        list.push({ registration: reg, payment, amount });
        byPayment.set(payment.id, list);
    }
    const allocations = [];
    for (const payment of payments) {
        if (payment.status !== 'success' || payment.payment_type !== 'event_entry_fee'
            || isLicensePaymentRow(payment) || isCompedEntryPayment(payment)) continue;
        const rows = byPayment.get(payment.id) || [];
        const assigned = rows.reduce((s, row) => s + row.amount, 0);
        if (assigned > Number(payment.amount) + 0.01) {
            throw new Error(`Payment ${payment.reference || payment.id} is allocated more than once. Review its registrations before exporting.`);
        }
        allocations.push(...rows);
        const remainder = Math.round((Number(payment.amount) - assigned) * 100) / 100;
        if (remainder > 0) allocations.push({ registration: null, payment, amount: remainder });
    }
    return allocations;
}

// Keep URLs bounded and fail explicitly instead of turning failed/hidden refunds into zero.
export async function loadEventRefunds(client, registrations, payments) {
    const found = new Map();
    for (const [column, ids] of [
        ['event_registration_id', registrations.map((r) => r.id)],
        ['payment_id', payments.map((p) => p.id)],
    ]) {
        const unique = [...new Set(ids.filter(Boolean))];
        for (let i = 0; i < unique.length; i += 30) {
            const { data, error } = await client.from('payment_refunds').select('*').in(column, unique.slice(i, i + 30));
            if (error) throw new Error(`Refunds could not be loaded: ${error.message}`);
            for (const row of data || []) found.set(row.id, row);
        }
    }
    const rows = [...found.values()];
    for (const reg of registrations.filter((r) => r.payment_status === 'refunded')) {
        if (!rows.some((r) => r.event_registration_id === reg.id && r.status !== 'failed')) {
            throw new Error('Refund records are missing for a refunded entry. Reload with finance access before exporting.');
        }
    }
    return rows;
}
