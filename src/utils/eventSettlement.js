import {
    getRegistrationEntryFeePaid, isCompedEntryPayment,
    isExplicitAdminMarkedPayment, isLicensePaymentRow, isLicenseRefund,
    normalizePaymentMetadata, paymentMatchesRegistration, paymentHasEntryCoverForRegistration, registrationIsCompedEntry, findExpectedEntryPayment,
} from './paymentRegistrationMatch.js';
import { registrationDivisionKey, resolveRegistrationDivision } from './registrationDivision.js';
import { findFinancePayment } from './eventFinanceReconciliation.js';

const norm = value => String(value || '').trim().toLowerCase();
const money = value => Math.round(((Number(value) || 0) + Number.EPSILON) * 100) / 100;
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

/** The recipient is independent of the payment method. Legacy manual receipts
 * stay unconfirmed until a manager identifies who actually received the money. */
export function collectionRecipient(payment) {
    if (norm(payment?.payment_method) === 'paystack' && !isExplicitAdminMarkedPayment(payment)) return '4m';
    const recipient = norm(normalizePaymentMetadata(payment?.metadata).collection_recipient);
    if (recipient === '4m') return '4m';
    if (['organiser', 'club'].includes(recipient)) return 'organiser';
    return norm(payment?.payment_method) === 'paystack' ? '4m' : null;
}

export function collectionBucket(payment) {
    const recipient = payment?.recipient ?? collectionRecipient(payment);
    if (recipient === 'organiser') return 'Club / organiser';
    if (recipient === '4m') return norm(payment.payment_method) === 'paystack' ? '4M Paystack' : '4M EFT / manual';
    return 'Recipient unconfirmed';
}

/** Completed requests already live in the interim-payment array. Never add
 * request amounts separately, or count a retried request ID twice. */
export function completedOrganiserPayouts(rows = []) {
    const seen = new Set();
    return rows.filter(row => {
        if (row.status && !['paid', 'success', 'processed', 'completed'].includes(norm(row.status))) return false;
        if (positive(row.amount) <= 0) return false;
        const key = row.request_id || row.id || (row.reference && norm(row.reference));
        if (key && seen.has(key)) return false;
        if (key) seen.add(key);
        return true;
    });
}

/** All event screens use this statement:
 * collected - completed refunds - 5% of gross collections received by 4M = entitlement;
 * entitlement - organiser-held receipts (net of organiser-funded refunds)
 * - completed 4M payouts = balance due. Pending refunds reserve payout cash,
 * but are not represented as completed refunds or unpaid entry fees. */
export function calculateEventSettlement({ event = {}, registrations = [], divisions = [], payments = [], refunds = [], verification = null, entryFeeForRegistration, interimPayments = event.organiser_interim_payments || [] } = {}) {
    refunds = refunds.map(r => ({ ...r, metadata: normalizePaymentMetadata(r.metadata) }));
    const issues = [];
    const referenceLinks = event.organiser_settlement_confirmation?.receipt_links || [];
    const eligible = payments.filter(p => !p.is_test && !normalizePaymentMetadata(p.metadata).is_test
        && norm(p.payment_type) === 'event_entry_fee' && !isLicensePaymentRow(p) && !isCompedEntryPayment(p)).map(p => {
        const link = referenceLinks.find(link => link.payment_id === p.id);
        return { ...p, metadata: { ...normalizePaymentMetadata(p.metadata), ...(link ? { paystack_ref: link.reference } : {}) } };
    });
    const verified = new Map([...(verification?.receipts || []), ...(verification?.reversals || [])].map(r => [r.reference, r]));
    const denied = new Set((verification?.non_receipts || []).map(r => r.reference));
    const success = eligible.filter(p => (['success', 'refunded'].includes(norm(p.status)) || verified.has(p.reference))
        && !denied.has(p.reference)).map(p => ({ ...p, status: 'success' }));
    const groups = new Map();
    for (const payment of success) {
        const aliases = [...refsFor(payment)].filter(ref => ref !== payment.reference);
        let reference = aliases.find(ref => verified.has(ref) || success.some(p => p.reference === ref && !isExplicitAdminMarkedPayment(p)))
            || aliases.find(ref => /^T\d{10,}$/.test(ref)) || payment.reference || payment.id;
        // An offline Paystack fix confirms an existing receipt; it is not new cash.
        if (norm(payment.payment_method) === 'paystack' && isExplicitAdminMarkedPayment(payment) && reference === payment.reference) {
            const original = success.find(p => !isExplicitAdminMarkedPayment(p) && norm(p.payment_method) === 'paystack'
                && registrations.some(reg => paymentMatchesRegistration(payment, reg) && paymentMatchesRegistration(p, reg)));
            if (!original) { issues.push(`Link the original Paystack reference: ${payment.reference || payment.id}`); continue; }
            reference = original.reference || original.id;
        }
        const claims = groups.get(reference) || [];
        claims.push(payment); groups.set(reference, claims);
    }
    const receiptRows = [...groups].map(([reference, claims]) => {
        const primary = claims.find(p => p.reference === reference && !isExplicitAdminMarkedPayment(p)) || claims[0];
        const gateway = verified.get(reference);
        const external = reference !== primary.reference;
        let amount = gateway && external ? Math.min(positive(gateway.amount), sum(claims))
            : positive(primary.amount);
        if (gateway && amount > positive(gateway.amount)) {
            issues.push(`Receipt allocation exceeds Paystack amount: ${reference}`);
            amount = positive(gateway.amount);
        }
        if (external && claims.length > 1 && (!gateway || sum(claims) > positive(gateway.amount))) {
            issues.push(`Multiple entry confirmations share ${reference}; review the receipt allocation`);
        }
        const recipient = gateway || external && /^T\d{10,}$/.test(reference) ? '4m' : collectionRecipient(primary);
        if (!recipient) issues.push(`Confirm who received ${reference || primary.id}`);
        const unallocatedCredit = Math.min(amount, Math.max(0, ...claims.map(p => positive(p.metadata.unallocated_credit_amount))));
        return { ...primary, reference, amount, recipient, gateway, claims, unallocatedCredit, paymentIds: claims.map(p => p.id),
            payment_method: gateway || external && /^T\d{10,}$/.test(reference) ? 'paystack' : primary.payment_method };
    });
    const paymentById = new Map(payments.map(p => [p.id, p]));
    const processedRefundRows = [], reservedRefundRows = [];
    const usedRefunds = new Set();
    for (const receipt of receiptRows) {
        const linked = refunds.filter(r => receipt.paymentIds.includes(r.payment_id) || r.paystack_reference === receipt.reference
            || (!r.payment_id && !r.paystack_reference && r.event_registration_id
                && receipt.claims.some(p => p.metadata.registration_id === r.event_registration_id)
                && receiptRows.filter(other => other.claims.some(p => p.metadata.registration_id === r.event_registration_id)).length === 1));
        const rows = [];
        for (const gateway of (verification?.gateway_refunds || []).filter(r => r.reference === receipt.reference)) {
            const recorded = refunds.find(r => r.paystack_refund_id && String(r.paystack_refund_id) === String(gateway.refund_id));
            if (recorded && isLicenseRefund(recorded, paymentById.get(recorded.payment_id))) continue;
            if (!recorded && positive(receipt.gateway?.amount) > receipt.amount) {
                issues.push(`Refund needs entry/licence allocation: ${receipt.reference}`);
                continue;
            }
            rows.push({ ...gateway, ...(recorded || {}), id: recorded?.id || `gateway-${gateway.refund_id}`,
                recorded_id: recorded?.id, paystack_refund_id: gateway.refund_id,
                status: gateway.status, amount: positive(recorded?.amount ?? gateway.amount) });
        }
        rows.push(...linked);
        rows.sort((a, b) => Number(norm(b.status) === 'processed') - Number(norm(a.status) === 'processed'));
        receipt.refunded = 0; receipt.reserved = 0;
        for (const row of rows) {
            if (isLicenseRefund(row, paymentById.get(row.payment_id))) continue;
            const status = norm(row.status);
            if (!['processed', 'pending', 'processing', 'needs-attention', 'needs_attention'].includes(status)) continue;
            const key = row.paystack_refund_id ? `provider-${row.paystack_refund_id}` : row.id;
            if (key && usedRefunds.has(key)) continue;
            if (key) usedRefunds.add(key);
            const available = positive(receipt.amount - receipt.refunded - receipt.reserved);
            if (positive(row.amount) > available) issues.push(`Refunds exceed entry receipt: ${receipt.reference}`);
            const amount = Math.min(positive(row.amount), available);
            const fundedBy = norm(normalizePaymentMetadata(row.metadata).refund_funded_by) || receipt.recipient;
            const item = { ...row, amount, receipt, fundedBy };
            if (status === 'processed') { processedRefundRows.push(item); receipt.refunded = money(receipt.refunded + amount); }
            else { reservedRefundRows.push(item); receipt.reserved = money(receipt.reserved + amount); }
        }
        receipt.net = money(receipt.amount - receipt.refunded - receipt.reserved);
        receipt.unallocatedCredit = Math.min(receipt.unallocatedCredit, positive(receipt.net));
    }
    for (const refund of refunds) {
        if (norm(refund.status) === 'failed' || isLicenseRefund(refund, paymentById.get(refund.payment_id))) continue;
        const key = refund.paystack_refund_id ? `provider-${refund.paystack_refund_id}` : refund.id;
        if (!usedRefunds.has(key)) issues.push(`Entry refund has no collected receipt: ${refund.id}`);
    }
    const active = activeSettlementRegistrations(registrations, divisions);
    const invoices = active.map(reg => {
        const comped = registrationIsCompedEntry(reg, payments);
        const payment = findFinancePayment(success, reg, refunds);
        const fallback = entryFeeForRegistration ? entryFeeForRegistration(reg) : resolveRegistrationDivision(reg, divisions)?.entry_fee ?? reg.tournament_divisions?.entry_fee ?? event.category_fees?.[reg.division] ?? event.entry_fee ?? 0;
        return { registration: reg, amount: comped ? 0 : positive(getRegistrationEntryFeePaid(payment, reg, fallback)), comped };
    });
    let paid4M = 0, paidClub = 0, pendingCount = 0, pendingAmount = 0;
    const available = new Map(receiptRows.map(r => [r.reference, positive(r.net - r.unallocatedCredit)]));
    const priority = invoice => receiptRows.some(r => norm(r.gateway?.payer_email || r.metadata?.email) === norm(invoice.registration.email)) ? 1 : 0;
    const allocations = [...invoices].sort((a, b) => priority(b) - priority(a)).map(invoice => {
        const reg = invoice.registration;
        if (invoice.comped) return { ...invoice, holder: 'comped' };
        const onlyEntryForEmail = invoices.filter(i => norm(i.registration.email) === norm(reg.email)).length === 1;
        const matches = receiptRows.filter(r => r.claims.some(p => {
            const registrationId = normalizePaymentMetadata(p.metadata).registration_id;
            if (registrationId && registrationId !== reg.id) return false;
            return paymentMatchesRegistration(p, reg) || (onlyEntryForEmail && paymentHasEntryCoverForRegistration(p, reg, { requireDivision: false }));
        })).sort((a, b) => {
            // A receipt explicitly recorded for this entry takes priority over
            // an older team checkout that also covered a refunded division.
            const direct = receipt => Number(receipt.claims.some(p => normalizePaymentMetadata(p.metadata).registration_id === reg.id));
            return direct(b) - direct(a) || new Date(b.created_at || 0) - new Date(a.created_at || 0);
        });
        let remaining = invoice.amount;
        const shares = [];
        for (const receipt of matches) {
            const amount = Math.min(remaining, available.get(receipt.reference));
            if (amount <= 0) continue;
            available.set(receipt.reference, money(available.get(receipt.reference) - amount));
            remaining = money(remaining - amount); shares.push({ receipt, amount });
        }
        // A refund of this exact entry reduces income, not an unpaid invoice.
        const refundsForEntry = rows => rows.filter(r => r.event_registration_id === reg.id
            || (!r.event_registration_id && matches.includes(r.receipt) && invoices.filter(i => r.receipt.claims.some(p => paymentMatchesRegistration(p, i.registration))).length === 1));
        const returned = sum(refundsForEntry(processedRefundRows));
        const reserved = sum(refundsForEntry(reservedRefundRows));
        remaining = positive(remaining - returned - reserved);
        const holder = remaining > 0 ? 'pending' : shares.some(s => s.receipt.recipient === 'organiser') ? 'club'
            : shares.some(s => !s.receipt.recipient) ? 'unconfirmed' : '4m';
        if (remaining > 0 && norm(reg.payment_status) !== 'refunded') { pendingCount++; pendingAmount = money(pendingAmount + remaining); }
        else if (shares.length) { if (holder === 'club') paidClub++; else if (holder === '4m') paid4M++; }
        if (remaining > 0 && norm(reg.payment_status) === 'paid' && !findExpectedEntryPayment(payments, reg)) issues.push(`Paid entry has no fully allocated receipt: ${reg.full_name || reg.email || reg.id}`);
        return { ...invoice, holder, receipt: shares[0]?.receipt, payment: shares[0]?.receipt.claims[0], shares, outstanding: norm(reg.payment_status) === 'refunded' ? 0 : remaining };
    });
    const grossEntryFees = sum(receiptRows);
    const entryFeesRefunded = sum(processedRefundRows);
    const refundReserve = sum(reservedRefundRows);
    const collected4M = sum(receiptRows.filter(r => r.recipient === '4m'));
    const collectedManual = sum(receiptRows.filter(r => r.recipient === '4m' && norm(r.payment_method) !== 'paystack'));
    const paystackCollected = sum(receiptRows.filter(r => r.recipient === '4m' && norm(r.payment_method) === 'paystack'));
    const collectedOrganiser = sum(receiptRows.filter(r => r.recipient === 'organiser'));
    const organiserRefunds = sum(processedRefundRows.filter(r => ['organiser', 'club'].includes(r.fundedBy)));
    const organiserRetained = money(collectedOrganiser - organiserRefunds);
    const unconfirmedCollected = sum(receiptRows.filter(r => !r.recipient));
    const unallocatedCredit4M = money(receiptRows.filter(r => r.recipient === '4m').reduce((total, r) => total + r.unallocatedCredit, 0));
    const entryFeeBalance = money(grossEntryFees - entryFeesRefunded);
    const commissionBase = collected4M;
    const commission = Math.round(Math.round(commissionBase * 100) * 5 / 100) / 100;
    const organiserEntitlement = money(entryFeeBalance - commission);
    const payoutRows = completedOrganiserPayouts(interimPayments);
    const interimPaid = sum(payoutRows);
    const dueBeforeInterim = money(organiserEntitlement - organiserRetained);
    const dueToOrg = money(dueBeforeInterim - interimPaid);
    const totalAmountBilled = money(grossEntryFees + pendingAmount);
    const tiers = new Map();
    for (const receipt of receiptRows) {
        const covers = [...new Map(receipt.claims.flatMap(p => {
            const meta = normalizePaymentMetadata(p.metadata);
            return (meta.covers || []).filter(c => c.type === 'entry').map(c => [`${norm(c.email)}:${c.division || ''}`, c]);
        })).values()];
        const count = Math.max(1, covers.length);
        const rate = money(receipt.amount / count);
        const tier = tiers.get(rate) || { rate, count: 0, total: 0 };
        tier.count += count; tier.total = money(tier.total + receipt.amount); tiers.set(rate, tier);
    }
    const result = { collected4M, paystackCollected, collectedManual, collectedOrganiser, organiserRetained, unconfirmedCollected, unallocatedCredit4M,
        netHeld4M: money(collected4M - sum(processedRefundRows.filter(r => r.fundedBy === '4m'))),
        grossEntryFees, entryFeesRefunded, refundReserve, entryFeeBalance, commissionBase, commission, organiserEntitlement,
        totalAmountBilled, pendingCount, pendingAmount, paid4M, paidClub, interimPaid, payoutRows, dueBeforeInterim, dueToOrg,
        availableForPayout: positive(dueToOrg - refundReserve - unconfirmedCollected - unallocatedCredit4M),
        billedTierBreakdown: [...tiers.values()].sort((a, b) => a.rate - b.rate),
        compedEntries: invoices.filter(i => i.comped).length, withdrawnCount: registrations.filter(r => ['withdrawn', 'cancelled'].includes(norm(r.status))).length,
        licenseRevenue4M: sum(payments.filter(p => !p.is_test && !normalizePaymentMetadata(p.metadata).is_test && p.status === 'success' && isLicensePaymentRow(p))),
        licenseRefunds: sum(refunds.filter(r => r.status === 'processed' && isLicenseRefund(r, paymentById.get(r.payment_id)))),
        receiptRows, processedRefundRows, reservedRefundRows, allocations, issues: [...new Set([...issues, ...(verification?.unresolved || []).map(r => r.reason)])],
        verificationComplete: verification?.complete === true, activeEntries: invoices.length,
        // Legacy aggregate confirmations must never override actual cash movements.
        confirmation: null, confirmationAdjustment: 0 };
    return { ...result, calculated: { ...result } };
}

/** Aggregate event statements without netting an overpayment against another
 * organiser's unpaid balance. Totals always cover the same displayed events. */
export function summarizeEventSettlements(events = []) {
    const total = key => money(events.reduce((n, event) => n + Number(event.settlement?.[key] || 0), 0));
    return { events: events.length, entries: total('activeEntries'), collected: total('grossEntryFees'),
        refunds: total('entryFeesRefunded'), commission: total('commission'), paid: total('interimPaid'),
        direct: total('organiserRetained'), balanceOwed: money(events.reduce((n, e) => n + Math.max(0, e.settlement?.dueToOrg || 0), 0)),
        overpaid: money(events.reduce((n, e) => n + Math.max(0, -(e.settlement?.dueToOrg || 0)), 0)) };
}

export function buildEventSettlements({ events = [], registrations = [], participants = [], payments = [], refunds = [], divisions = [] } = {}) {
    return events.map(event => {
        const eventPayments = payments.filter(p => String(p.event_id) === String(event.id));
        const eventRegistrations = event.is_manual ? registrations.filter(r => String(r.event_id) === String(event.id))
            : participants.filter(p => String(p.event_id) === String(event.id)).map(p => ({ ...p,
                email: p.email || p.players?.email, division: p.class_name,
                payment_status: p.is_paid ? 'paid' : 'pending' }));
        const ids = new Set(eventPayments.map(p => p.id));
        const references = new Set(eventPayments.flatMap(p => [...refsFor(p)]));
        const registrationIds = new Set(eventRegistrations.map(r => r.id));
        const settlement = calculateEventSettlement({ event, registrations: eventRegistrations, payments: eventPayments,
            refunds: refunds.filter(r => ids.has(r.payment_id) || registrationIds.has(r.event_registration_id) || references.has(r.paystack_reference)),
            divisions: divisions.filter(d => String(d.event_id) === String(event.id)) });
        return { ...event, settlement };
    });
}

export function eventPayoutRequestLimit(event, settlement, now = Date.now()) {
    const remainingDue = positive(settlement.dueToOrg);
    const totalDue = positive(settlement.dueBeforeInterim);
    const firstRequestCap = Math.floor(Math.round(totalDue * 100) / 2) / 100;
    const endDay = String(event.end_date || event.start_date || '').slice(0, 10);
    const eventEnded = now > new Date(`${endDay}T23:59:59.999+02:00`).getTime();
    const hasFirstPartial = settlement.interimPaid > 0;
    let blockedReason = settlement.issues[0] || '';
    if (!blockedReason && remainingDue <= 0) blockedReason = 'Nothing due to organiser yet';
    if (!blockedReason && settlement.availableForPayout <= 0) blockedReason = 'No payout available while refunds or credits are reserved';
    if (!blockedReason && !eventEnded && hasFirstPartial) blockedReason = 'First partial payment already recorded. The remaining balance can be requested after the event ends.';
    const maxRequestable = blockedReason ? 0 : Math.min(remainingDue, settlement.availableForPayout, eventEnded ? remainingDue : firstRequestCap);
    return { remainingDue, totalDue, firstRequestCap, eventEnded, hasFirstPartial, interimPaid: settlement.interimPaid,
        maxRequestable, phase: eventEnded ? 'final' : 'first', blockedReason, canRequest: maxRequestable > 0,
        helperText: eventEnded ? 'The event has ended. You can request the remaining available balance.'
            : 'First payout request is limited to 50% of the amount due. The remaining balance can be requested after the event ends.' };
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
