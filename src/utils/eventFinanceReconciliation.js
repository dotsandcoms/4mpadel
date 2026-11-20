import {
    findPaymentForRegistration, getRegistrationEntryFeePaid, isLicensePaymentRow,
    isCompedEntryPayment, isEntryFeeRefund, normalizePaymentMetadata, paymentStrictlyCoversRegistration,
    hasVerifiedEntryTransfer, hasVerifiedPaymentEntryTransfers, isDivisionSwitchPayment, verifiedDivisionSwitchAmount,
} from './paymentRegistrationMatch.js';
import { fetchAllRows } from './fetchAllRows.js';

const fullyRefundedForAnotherRegistration = (payment, reg, refunds) => {
    const entryRefunds = refunds.filter((refund) => refund.payment_id === payment.id
        && isEntryFeeRefund(refund, payment));
    if (entryRefunds.some((refund) => refund.event_registration_id === reg.id)) return false;
    const refunded = entryRefunds.reduce((total, refund) => total + Number(refund.amount || 0), 0);
    return Number(payment.amount) > 0 && refunded >= Number(payment.amount) - 0.01;
};

function findWithdrawnOriginalPayment(payments, reg, refunds) {
    if (reg.status !== 'withdrawn') return null;
    const originals = new Map(payments.filter(payment =>
        !isDivisionSwitchPayment(payment) && !isLicensePaymentRow(payment)).map(payment => [payment.id, payment]));
    const refund = refunds.find(row => row.event_registration_id === reg.id && row.status !== 'failed'
        && normalizePaymentMetadata(row.metadata).cover_type !== 'license' && originals.has(row.payment_id));
    return refund ? originals.get(refund.payment_id) : null;
}

// Financial reports need an exact original entry link for a transferred checkout.
export function findFinancePayment(payments, reg, refunds = []) {
    const withdrawnOriginal = findWithdrawnOriginalPayment((payments || []).filter(p => p.status === 'success'), reg, refunds);
    if (withdrawnOriginal) return withdrawnOriginal;
    const candidates = (payments || []).filter((p) => {
        const meta = normalizePaymentMetadata(p.metadata);
        return p.status === 'success' && !isLicensePaymentRow(p) && !isDivisionSwitchPayment(p)
            && (!meta.registration_id || meta.registration_id === reg.id || hasVerifiedEntryTransfer(p, reg))
            && !(Number(meta.unallocated_credit_amount) > 0 && Number(meta.unallocated_credit_amount) >= Number(p.amount))
            // Email + division also match a later re-entry. A fully refunded
            // receipt stays with its original entry, even if the re-entry is pending.
            && !fullyRefundedForAnotherRegistration(p, reg, refunds);
    });
    const latest = (rows) => [...rows].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0] || null;
    if ((payments || []).some(payment => verifiedDivisionSwitchAmount(payment, reg) > 0)) {
        const originals = candidates.filter(payment => paymentStrictlyCoversRegistration(payment, reg));
        if (originals.length) return originals.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0))[0];
    }
    const direct = latest(candidates.filter(p => {
        const meta = normalizePaymentMetadata(p.metadata);
        return hasVerifiedEntryTransfer(p, reg) || (meta.registration_id === reg.id
            && (!hasVerifiedPaymentEntryTransfers(p) || paymentStrictlyCoversRegistration(p, reg)));
    }));
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
        const original = findWithdrawnOriginalPayment(payments, reg, refunds) || findFinancePayment(payments, reg, refunds);
        const topUps = payments.filter(payment => verifiedDivisionSwitchAmount(payment, reg) > 0);
        for (const payment of [original, ...topUps]) {
            if (!payment || isLicensePaymentRow(payment) || isCompedEntryPayment(payment)) continue;
            const amount = getRegistrationEntryFeePaid(payment, reg, 0);
            if (amount <= 0) continue;
            const list = byPayment.get(payment.id) || [];
            list.push({ registration: reg, payment, amount });
            byPayment.set(payment.id, list);
        }
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
    const references = payment => {
        const meta = normalizePaymentMetadata(payment.metadata);
        return [payment.reference, meta.paystack_ref, ...(`${meta.note || ''} ${meta.payment_note || ''}`.match(/\bT\d{10,}\b/g) || [])].filter(Boolean);
    };
    for (const [column, ids] of [
        ['event_registration_id', registrations.map((r) => r.id)],
        ['payment_id', payments.map((p) => p.id)],
        ['paystack_reference', payments.flatMap(references)],
    ]) {
        const unique = [...new Set(ids.filter(Boolean))];
        for (let i = 0; i < unique.length; i += 30) {
            let data;
            try {
                data = await fetchAllRows(() => client.from('payment_refunds').select('*')
                    .in(column, unique.slice(i, i + 30)).order('id', { ascending: true }));
            } catch (error) { throw new Error(`Refunds could not be loaded: ${error.message}`); }
            for (const row of data || []) found.set(row.id, row);
        }
    }
    const rows = [...found.values()];
    for (const reg of registrations.filter((r) => r.payment_status === 'refunded')) {
        if (!rows.some((r) => r.status !== 'failed' && (r.event_registration_id === reg.id
            || payments.some(p => (p.id === r.payment_id || references(p).includes(r.paystack_reference))
                && paymentStrictlyCoversRegistration(p, reg))))) {
            throw new Error('Refund records are missing for a refunded entry. Reload with finance access before exporting.');
        }
    }
    return rows;
}
