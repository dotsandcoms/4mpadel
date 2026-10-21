import {
    findPaymentForRegistration, getRegistrationEntryFeePaid, isCompedEntryPayment,
    isExplicitAdminMarkedPayment, isLicensePaymentRow, isLicenseRefund,
    normalizePaymentMetadata, paymentMatchesRegistration, paymentHasEntryCoverForRegistration, registrationIsCompedEntry,
} from './paymentRegistrationMatch.js';
import { registrationDivisionKey, resolveRegistrationDivision } from './registrationDivision.js';

const norm = value => String(value || '').trim().toLowerCase();
const money = value => Math.round((Number(value) || 0) * 100) / 100;
const positive = value => Math.max(0, money(value));
const sum = rows => money(rows.reduce((total, row) => total + Number(row.amount || 0), 0));
const refsFor = payment => {
    const meta = normalizePaymentMetadata(payment.metadata);
    return new Set([payment.reference, meta.paystack_ref, ...(`${meta.note || ''} ${meta.payment_note || ''}`.match(/\bT\d{10,}\b/g) || [])].filter(Boolean));
};

/** One invoice per active email/division. Payment snapshots preserve entry prices after a division rename. */
export function activeSettlementRegistrations(registrations = [], divisions = []) {
    const selected = new Map();
    const score = r => (norm(r.payment_status) === 'paid' ? 100 : 0) + (r.partner_email || r.partner_name ? 10 : 0) + new Date(r.created_at || 0).getTime() / 1e15;
    for (const reg of registrations) {
        if (['withdrawn', 'cancelled'].includes(norm(reg.status))) continue;
        const key = `${norm(reg.email) || reg.id}::${registrationDivisionKey(reg, divisions)}`;
        if (!selected.has(key) || score(reg) > score(selected.get(key))) selected.set(key, reg);
    }
    return [...selected.values()];
}

/** Cash held by 4M comes exclusively from Paystack, including external links.
 * Admin confirmations are allocation evidence, never additional cash receipts.
 * Commission is 5% of active entry invoices, including club-held and unpaid entries.
 */
export function calculateEventSettlement({ event = {}, registrations = [], divisions = [], payments = [], refunds = [], verification = null, entryFeeForRegistration, interimPayments = event.organiser_interim_payments || [] } = {}) {
    const issues = [];
    const referenceLinks = event.organiser_settlement_confirmation?.receipt_links || [];
    const eligible = payments.filter(p => !p.is_test && !normalizePaymentMetadata(p.metadata).is_test && !isLicensePaymentRow(p) && !isCompedEntryPayment(p)).map(p => {
        const link = referenceLinks.find(link => link.payment_id === p.id);
        return link ? { ...p, metadata: { ...normalizePaymentMetadata(p.metadata), paystack_ref: link.reference } } : p;
    });
    const success = eligible.filter(p => ['success', 'refunded'].includes(norm(p.status)));
    const active = activeSettlementRegistrations(registrations, divisions);
    const invoices = active.map(reg => {
        const comped = registrationIsCompedEntry(reg, payments);
        const payment = findPaymentForRegistration(success, reg);
        const fallback = entryFeeForRegistration ? entryFeeForRegistration(reg) : resolveRegistrationDivision(reg, divisions)?.entry_fee ?? event.category_fees?.[reg.division] ?? event.entry_fee ?? 0;
        return { registration: reg, amount: comped ? 0 : positive(getRegistrationEntryFeePaid(payment, reg, fallback)), comped };
    });
    const totalAmountBilled = sum(invoices);
    const verified = new Map([...(verification?.receipts || []), ...(verification?.reversals || [])].map(r => [r.reference, r]));
    const denied = new Set((verification?.non_receipts || []).map(r => r.reference));
    const receipts = new Map();
    const addReceipt = row => {
        if (!receipts.has(row.reference)) receipts.set(row.reference, row);
    };
    for (const p of eligible) {
        if (norm(p.payment_type) !== 'event_entry_fee' || norm(p.payment_method) !== 'paystack' || !p.reference || /^MANUAL-ADMIN-/.test(p.reference)) continue;
        const proof = verified.get(p.reference);
        if (denied.has(p.reference)) continue;
        if (isExplicitAdminMarkedPayment(p) && !proof) continue;
        if (!proof && !['success', 'refunded'].includes(norm(p.status))) continue;
        if (verification?.complete && !proof) { issues.push(`Receipt not verified: ${p.reference}`); continue; }
        const amount = positive(p.amount);
        if (proof && amount > positive(proof.amount)) { issues.push(`Receipt allocation exceeds Paystack amount: ${p.reference}`); continue; }
        addReceipt({ ...p, amount, gateway: proof, claims: [proof ? { ...p, status: 'success' } : p], paymentIds: [p.id] });
    }
    for (const proof of verified.values()) {
        if (receipts.has(proof.reference)) continue;
        const claims = success.filter(p => refsFor(p).has(proof.reference));
        if (!claims.length) continue;
        const amount = Math.min(positive(proof.amount), sum(claims));
        if (amount <= 0) continue;
        addReceipt({ id: `external-${proof.reference}`, reference: proof.reference, amount,
            created_at: proof.paid_at, payment_method: 'paystack', status: 'success', gateway: proof,
            metadata: normalizePaymentMetadata(claims[0].metadata), claims, paymentIds: claims.map(p => p.id) });
        if (sum(claims) > amount) issues.push(`Multiple entry confirmations share ${proof.reference}; only ${amount} was received`);
    }
    // Both a normal ledger row and an admin note can name the same physical receipt.
    // Merge the claims without adding another receipt or changing its cash amount.
    for (const receipt of receipts.values()) {
        for (const claim of success.filter(p => refsFor(p).has(receipt.reference))) {
            if (!receipt.paymentIds.includes(claim.id)) { receipt.claims.push(claim); receipt.paymentIds.push(claim.id); }
        }
    }
    const receiptRows = [...receipts.values()];
    const refundByProviderId = new Map(refunds.filter(r => r.paystack_refund_id).map(r => [String(r.paystack_refund_id), r]));
    const processedRefundRows = [];
    const reservedRefundRows = [];
    const usedRefunds = new Set();
    for (const receipt of receiptRows) {
        const linked = refunds.filter(r => receipt.paymentIds.includes(r.payment_id) || r.paystack_reference === receipt.reference);
        const gatewayRows = (verification?.gateway_refunds || []).filter(r => r.reference === receipt.reference);
        const rows = [];
        for (const refund of gatewayRows) {
            const recorded = refundByProviderId.get(String(refund.refund_id));
            if (recorded && isLicenseRefund(recorded, payments.find(p => p.id === recorded.payment_id))) { usedRefunds.add(recorded.id); continue; }
            if (!recorded && positive(receipt.gateway?.amount) > receipt.amount) issues.push(`Refund needs entry/licence allocation: ${receipt.reference}`);
            rows.push({ ...refund, id: `gateway-${refund.refund_id}`, recorded_id: recorded?.id, amount: positive(refund.amount), receipt });
            if (recorded) usedRefunds.add(recorded.id);
        }
        for (const refund of linked) {
            if (usedRefunds.has(refund.id) || isLicenseRefund(refund, payments.find(p => p.id === refund.payment_id))) continue;
            rows.push({ ...refund, amount: positive(refund.amount), receipt });
            usedRefunds.add(refund.id);
        }
        for (const row of rows) {
            if (norm(row.status) === 'processed') processedRefundRows.push(row);
            else if (['pending', 'processing', 'needs-attention', 'needs_attention'].includes(norm(row.status))) reservedRefundRows.push(row);
        }
        receipt.refunded = Math.min(receipt.amount, sum(rows.filter(r => norm(r.status) === 'processed')));
        receipt.reserved = Math.min(Math.max(0, receipt.amount - receipt.refunded), sum(rows.filter(r => ['pending', 'processing', 'needs-attention', 'needs_attention'].includes(norm(r.status)))));
        receipt.net = money(receipt.amount - receipt.refunded - receipt.reserved);
    }
    const grossCollected4M = sum(receiptRows);
    const entryFeesRefunded = money(receiptRows.reduce((s, r) => s + r.refunded, 0));
    const refundReserve = money(receiptRows.reduce((s, r) => s + r.reserved, 0));
    const netHeld4M = money(grossCollected4M - entryFeesRefunded - refundReserve);
    let paid4M = 0, paidClub = 0, pendingCount = 0, pendingAmount = 0, collectedManual = 0;
    const available = new Map(receiptRows.map(r => [r.reference, r.net]));
    const priority = invoice => receiptRows.some(r => norm(r.gateway?.payer_email || r.metadata?.email) === norm(invoice.registration.email)) ? 1 : 0;
    const allocations = [...invoices].sort((a, b) => priority(b) - priority(a)).map(invoice => {
        const reg = invoice.registration;
        if (invoice.comped) return { ...invoice, holder: 'comped' };
        const onlyEntryForEmail = invoices.filter(i => norm(i.registration.email) === norm(reg.email)).length === 1;
        const funded = receiptRows.find(r => available.get(r.reference) >= invoice.amount && r.claims.some(p => paymentMatchesRegistration(p, reg)
            || (onlyEntryForEmail && paymentHasEntryCoverForRegistration(p, reg, { requireDivision: false }))));
        // Prefer a current club confirmation to an old fully refunded Paystack receipt.
        const club = success.find(p => norm(p.payment_method) !== 'paystack'
            && ![...refsFor(p)].some(ref => verified.has(ref) || /^T\d{10,}$/.test(ref))
            && paymentMatchesRegistration(p, reg));
        let holder = 'pending';
        if (funded) { holder = '4m'; paid4M++; available.set(funded.reference, money(available.get(funded.reference) - invoice.amount)); }
        else if (club && norm(reg.payment_status) === 'paid') { holder = 'club'; paidClub++; collectedManual += invoice.amount; }
        else { pendingCount++; pendingAmount += invoice.amount; }
        return { ...invoice, holder, receipt: funded, payment: club };
    });
    const tiers = new Map();
    for (const invoice of invoices.filter(i => i.amount > 0)) {
        const tier = tiers.get(invoice.amount) || { rate: invoice.amount, count: 0, total: 0 };
        tier.count++; tier.total = money(tier.total + invoice.amount); tiers.set(invoice.amount, tier);
    }
    const commission = money(totalAmountBilled * 0.05);
    const interimPaid = sum(interimPayments.map(p => ({ amount: positive(p.amount) })));
    const calculated = { collected4M: grossCollected4M, netHeld4M, entryFeesRefunded, refundReserve, collectedManual: money(collectedManual), pendingCount, pendingAmount: money(pendingAmount), paid4M, paidClub,
        commission, dueBeforeInterim: money(netHeld4M - commission), dueToOrg: money(netHeld4M - commission - interimPaid) };
    const confirmation = event.organiser_settlement_confirmation;
    const confirmed = confirmation?.version === 1 && Number(confirmation.entry_count) === invoices.length
        && money(confirmation.total_billed) === totalAmountBilled
        && ['held_by_4m', 'club_collected', 'outstanding'].every(key => Number.isFinite(Number(confirmation[key])) && Number(confirmation[key]) >= 0)
        && money(Number(confirmation.held_by_4m) + Number(confirmation.club_collected) + Number(confirmation.outstanding)) === totalAmountBilled;
    const final = confirmed ? { ...calculated, netHeld4M: money(confirmation.held_by_4m), collectedManual: money(confirmation.club_collected), pendingAmount: money(confirmation.outstanding),
        pendingCount: Number(confirmation.unpaid_count || 0), paid4M: Number(confirmation.paystack_entry_count || 0), paidClub: Number(confirmation.club_entry_count || 0),
        dueBeforeInterim: money(confirmation.held_by_4m - commission), dueToOrg: money(confirmation.held_by_4m - commission - interimPaid) } : calculated;
    return { ...final, calculated, confirmation: confirmed ? confirmation : null, confirmationAdjustment: confirmed ? money(final.netHeld4M - calculated.netHeld4M) : 0,
        totalAmountBilled, billedTierBreakdown: [...tiers.values()].sort((a, b) => a.rate - b.rate),
        grossEntryFees: money(grossCollected4M + final.collectedManual), entryFeeBalance: money(final.netHeld4M + final.collectedManual),
        interimPaid, compedEntries: invoices.filter(i => i.comped).length, withdrawnCount: registrations.filter(r => norm(r.status) === 'withdrawn').length,
        licenseRevenue4M: sum(payments.filter(p => !p.is_test && p.status === 'success' && p.payment_method === 'paystack' && isLicensePaymentRow(p))),
        licenseRefunds: sum(refunds.filter(r => r.status === 'processed' && isLicenseRefund(r, payments.find(p => p.id === r.payment_id)))),
        receiptRows, processedRefundRows, reservedRefundRows, allocations, issues: [...issues, ...(verification?.unresolved || []).map(r => r.reason)],
        verificationComplete: verification?.complete === true, activeEntries: invoices.length };
}

/** Read actual gateway evidence in bounded batches; never changes ledger or registration rows. */
export async function loadEventCashVerification(client, eventId) {
    const result = { receipts: [], reversals: [], gateway_refunds: [], non_receipts: [], unresolved: [], complete: false };
    let offset = 0;
    do {
        const { data, error } = await client.functions.invoke('event-cash-receipts', { body: { event_id: eventId, verify_all: true, verify_refunds: true, offset } });
        if (error || !data || data.error) { result.unresolved.push({ reason: 'Paystack verification unavailable. Refresh before requesting a payout.' }); return result; }
        for (const key of ['receipts', 'reversals', 'gateway_refunds', 'non_receipts', 'unresolved']) result[key].push(...(data[key] || []));
        offset = data.next_offset ?? null;
    } while (offset !== null);
    result.complete = result.unresolved.length === 0;
    return result;
}
