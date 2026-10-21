import {
    getPaymentMetadataLayers, getRegistrationEntryFeePaid, isCompedEntryPayment,
    isLicensePaymentRow, isLicenseRefund, normalizePaymentMetadata, paymentEntryCoversFor,
} from './paymentRegistrationMatch.js';
import { resolveRegistrationDivision } from './registrationDivision.js';

const norm = value => String(value || '').trim().toLowerCase();
const money = value => Math.round((Number(value) || 0) * 100) / 100;
const sum = values => money(values.reduce((total, value) => total + Number(value || 0), 0));
const withdrawn = reg => ['withdrawn', 'cancelled'].includes(norm(reg.status));
const time = value => new Date(value || 0).getTime() || 0;
const unique = values => [...new Set(values.filter(Boolean))];

/** Reporting only: canonical receipts remain the cash authority; historical
 * player allocations are a breakdown of those receipts, never extra income. */
export function buildEventReceiptReport({ registrations = [], divisions = [], payments = [], refunds = [], settlement = {} } = {}) {
    const withdrawalRows = [];
    const receiptRows = [];
    const linkedWithdrawals = new Set();
    const recordedRefund = row => refunds.find(r => r.id === (row.recorded_id || row.id)
        || (r.paystack_refund_id && String(r.paystack_refund_id) === String(row.refund_id)));
    const fee = reg => Number(resolveRegistrationDivision(reg, divisions)?.entry_fee || 0);
    const payer = (receipt, payment) => {
        const meta = normalizePaymentMetadata(payment.metadata);
        const { inner } = getPaymentMetadataLayers(meta);
        const email = receipt.gateway?.payer_email || meta.registrant_email || meta.email || payment.player_email || inner.registrant_email || '';
        const snapshot = [...(meta.registration_rows || []), ...(inner.registration_rows || [])].find(r => norm(r.email) === norm(email));
        const name = (norm(meta.registrant_email || meta.email) === norm(email) ? meta.registrant_name : '')
            || snapshot?.full_name || registrations.find(r => norm(r.email) === norm(email))?.full_name || '';
        return { payerName: name, payerEmail: email };
    };
    const refundDetails = rows => ({
        refundReferences: unique(rows.map(r => r.refund_id || r.paystack_refund_id || r.provider_refund_id || r.id)).join('; '),
        refundedAt: rows.map(r => r.refunded_at || r.processed_at || recordedRefund(r)?.processed_at || r.updated_at || r.created_at).filter(Boolean).sort().at(-1) || '',
    });
    const makeWithdrawal = (reg, receipt, payment, amount, returned, reserved, refundRows, note = '') => {
        const retained = money(amount - returned - reserved);
        const applied = receipt.payment_method === 'paystack' ? Math.min(retained, sum((settlement.allocations || [])
            .filter(a => a.receipt?.reference === receipt.reference && a.registration.id !== reg.id
                && norm(a.registration.email) === norm(reg.email)).map(a => a.amount))) : 0;
        linkedWithdrawals.add(reg.id);
        withdrawalRows.push({
            registrationId: reg.id, name: reg.full_name, email: reg.email, division: reg.division,
            ...payer(receipt, payment), paidAt: receipt.gateway?.paid_at || receipt.created_at,
            withdrawnAt: reg.withdrawn_at || '', amount, refunded: returned, reserved, retained, applied,
            status: reserved > 0 ? 'Refund pending' : returned >= amount ? 'Refunded'
                : applied > 0 ? 'Applied to current entry' : returned > 0 ? 'Partly refunded'
                    : receipt.payment_method === 'paystack' ? 'Payment retained' : 'Club payment recorded',
            holder: receipt.payment_method === 'paystack' ? '4M' : 'Club / organiser',
            method: receipt.payment_method, reference: receipt.reference,
            ...refundDetails(refundRows), note,
        });
    };

    const clubPayments = payments.filter(p => norm(p.status) === 'success' && !p.is_test
        && norm(p.payment_type) === 'event_entry_fee' && !normalizePaymentMetadata(p.metadata).is_test
        && !isLicensePaymentRow(p) && !isCompedEntryPayment(p) && norm(p.payment_method) !== 'paystack'
        && !/\bT\d{10,}\b/.test(JSON.stringify(normalizePaymentMetadata(p.metadata))) && Number(p.amount) > 0);
    const uniqueClub = [...new Map(clubPayments.map(p => [p.reference || p.id, p])).values()];
    const sources = [...(settlement.receiptRows || []), ...uniqueClub.map(p => ({ ...p, club: true, claims: [p], paymentIds: [p.id] }))];
    for (const receipt of sources) {
        // Prefer the original checkout to later admin confirmations of the same money.
        const source = receipt.claims?.find(p => p.reference === receipt.reference && !/^MANUAL-ADMIN-/.test(p.reference))
            || receipt.claims?.find(p => norm(normalizePaymentMetadata(p.metadata).email) === norm(receipt.gateway?.payer_email))
            || receipt.claims?.[0] || receipt;
        const meta = normalizePaymentMetadata(source.metadata);
        const { inner } = getPaymentMetadataLayers(meta);
        const snapshots = [...(meta.registration_rows || []), ...(inner.registration_rows || [])];
        const clubRefunds = receipt.club ? refunds.filter(r => r.payment_id === source.id && !isLicenseRefund(r, source)) : [];
        const processed = receipt.club ? clubRefunds.filter(r => norm(r.status) === 'processed')
            : (settlement.processedRefundRows || []).filter(r => r.receipt?.reference === receipt.reference);
        const pending = receipt.club ? clubRefunds.filter(r => ['pending', 'processing', 'needs_attention', 'needs-attention'].includes(norm(r.status)))
            : (settlement.reservedRefundRows || []).filter(r => r.receipt?.reference === receipt.reference);
        const allRefunds = [...processed, ...pending];
        const targets = new Map();
        // A refund's registration ID is stronger evidence than a renamed division label.
        for (const row of allRefunds) {
            const record = recordedRefund(row) || row;
            const reg = registrations.find(r => r.id === record.event_registration_id);
            if (reg) targets.set(reg.id, reg);
        }
        const covers = paymentEntryCoversFor(meta).filter(c => c.type === 'entry');
        const distinctCovers = [...new Map(covers.map(c => [`${norm(c.email)}::${c.division_id || c.division || ''}`, c])).values()];
        const candidates = distinctCovers.length ? distinctCovers : [{ email: meta.email || meta.registrant_email, division: meta.division, registration_id: meta.registration_id }];
        for (const cover of candidates) {
            const snap = snapshots.find(s => norm(s.email) === norm(cover.email) && (!cover.division || s.division === cover.division));
            const explicitId = cover.registration_id || snap?.id || meta.registration_id;
            const divisionId = cover.division_id || snap?.division_id;
            const matching = registrations.filter(reg => explicitId ? reg.id === explicitId
                : norm(reg.email) === norm(cover.email) && (!cover.division && !divisionId
                    || (divisionId && reg.division_id === divisionId) || reg.division === cover.division));
            const refundTarget = [...targets.values()].find(r => matching.some(m => m.id === r.id));
            const paidAt = time(receipt.gateway?.paid_at || receipt.created_at);
            const reg = refundTarget || (explicitId ? matching[0] : null) || matching.filter(r => time(r.created_at) <= paidAt + 300000
                && (!r.withdrawn_at || time(r.withdrawn_at) >= paidAt))
                .sort((a, b) => time(b.created_at) - time(a.created_at))[0];
            if (reg) targets.set(reg.id, reg);
        }
        let available = receipt.amount;
        const pricingCovers = distinctCovers.length ? distinctCovers : [...targets.values()].map(r => ({ type: 'entry', email: r.email, division: r.division }));
        const pricingPayment = { ...source, status: 'success', metadata: { ...meta, covers: pricingCovers,
            original_trx: { ...meta.original_trx, metadata: { ...inner, covers: [] } } } };
        const shares = [...targets.values()].map(reg => {
            const amount = Math.min(available, Math.max(0, getRegistrationEntryFeePaid(pricingPayment, reg, fee(reg))));
            available = money(available - amount);
            return { reg, amount };
        }).filter(s => s.amount > 0);
        const refundShare = (rows, reg, amount) => {
            const linked = rows.filter(row => {
                const record = recordedRefund(row) || row;
                return record.event_registration_id === reg.id || (!record.event_registration_id && shares.length === 1);
            });
            return { amount: Math.min(amount, sum(linked.map(r => r.amount))), rows: linked };
        };
        for (const { reg, amount } of shares.filter(s => withdrawn(s.reg))) {
            const returned = refundShare(processed, reg, amount);
            const reserve = refundShare(pending, reg, amount - returned.amount);
            const ambiguous = allRefunds.some(r => !(recordedRefund(r) || r).event_registration_id) && shares.length > 1;
            makeWithdrawal(reg, receipt, source, amount, returned.amount, reserve.amount,
                [...returned.rows, ...reserve.rows], receipt.club
                    ? 'Recorded club payment confirmation; excluded from 4M receipts. Payer is the recorded account. ' + (meta.note || meta.payment_note || '')
                    : ambiguous ? 'Receipt has a refund not allocated to a player; see 4M receipts.' : 'Entry share of receipt; already included in 4M receipts.');
            if (ambiguous) Object.assign(withdrawalRows.at(-1), {
                refunded: null, reserved: null, retained: null, applied: null, status: 'Refund allocation unresolved',
            });
        }
        if (receipt.club) continue;
        receiptRows.push({
            ...payer(receipt, source), paidAt: receipt.gateway?.paid_at || receipt.created_at,
            players: unique([...shares.map(s => s.reg.full_name), ...(settlement.allocations || []).filter(a => a.receipt?.reference === receipt.reference).map(a => a.registration.full_name)]).join('; '),
            divisions: unique(shares.map(s => s.reg.division)).join('; '),
            amount: receipt.amount, refunded: receipt.refunded || 0, reserved: receipt.reserved || 0, retained: receipt.net,
            reference: receipt.reference, holder: '4M', method: 'Paystack', ...refundDetails(allRefunds),
            status: receipt.gateway?.verified ? 'Verified' : 'Ledger record',
            note: [available > 0 ? `R${available.toFixed(2)} not allocated to a historical entry.` : '',
                (receipt.claims?.length || 0) > 1 ? 'Multiple ledger confirmations; this receipt is counted once.' : '',
                !receipt.gateway?.verified ? 'Gateway verification unavailable at export.' : ''].filter(Boolean).join(' '),
        });
    }

    for (const reg of registrations.filter(withdrawn)) {
        if (!linkedWithdrawals.has(reg.id)) withdrawalRows.push({
            registrationId: reg.id, name: reg.full_name, email: reg.email, division: reg.division,
            withdrawnAt: reg.withdrawn_at || '', amount: 0, refunded: 0, reserved: 0, retained: 0, applied: 0,
            status: 'No receipt linked', note: 'No entry receipt linked to this withdrawn registration. This does not assert that no payment was made.',
        });
    }
    return {
        receipts: receiptRows.sort((a, b) => time(a.paidAt) - time(b.paidAt)),
        withdrawals: withdrawalRows.sort((a, b) => Number(b.amount > 0) - Number(a.amount > 0) || String(a.name).localeCompare(String(b.name))),
    };
}
