export const ENTRY_COMMISSION_RATE = 0.05;
export const REGISTRATION_FINANCE_BASIS = 'current_registrations_v1';

const money = value => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const total = (rows, key) => money(rows.reduce((sum, row) => sum + Number(row[key] || 0), 0));

/** The same per-entry amounts feed the finance screen and Registrations export.
 * Shares already exclude completed/pending refunds and unallocated credits. */
export function registrationFinanceAmounts(allocation) {
    const shares = allocation.shares || [];
    const received = predicate => money(shares.filter(predicate).reduce((sum, share) => sum + share.amount, 0));
    return {
        entryAmount: allocation.amount,
        paidTo4M: received(s => s.receipt.recipient === '4m'),
        paidDirectToOrganiser: received(s => s.receipt.recipient === 'organiser'),
        recipientUnconfirmed: received(s => !s.receipt.recipient),
        outstanding: allocation.outstanding || 0,
        refunded: allocation.refunded || 0,
        refundPending: allocation.refundPending || 0,
        comped: allocation.comped,
    };
}

/** Current registrations are the settlement authority. Cash history is reported
 * separately; never charge or pay out a receipt again merely because it exists. */
export function summarizeRegistrationFinance(rows, { interimPaid = 0, refundFundingAdjustment = 0 } = {}) {
    const collected4M = total(rows, 'paidTo4M');
    const collectedOrganiser = total(rows, 'paidDirectToOrganiser');
    const unconfirmedCollected = total(rows, 'recipientUnconfirmed');
    const grossEntryFees = money(collected4M + collectedOrganiser + unconfirmedCollected);
    const commission = Math.round(Math.round(collected4M * 100) * ENTRY_COMMISSION_RATE) / 100;
    const dueBeforeInterim = money(collected4M - commission + refundFundingAdjustment);
    const dueToOrg = money(dueBeforeInterim - interimPaid);
    return {
        basis: REGISTRATION_FINANCE_BASIS,
        totalAmountBilled: total(rows, 'entryAmount'),
        collected4M, collectedOrganiser, unconfirmedCollected, grossEntryFees,
        entryFeeBalance: grossEntryFees,
        organiserRetained: collectedOrganiser,
        commissionBase: collected4M, commission,
        organiserEntitlement: money(collected4M + collectedOrganiser - commission),
        interimPaid, refundFundingAdjustment, dueBeforeInterim, dueToOrg,
        // Refund reserves and credits were excluded before allocating the shares.
        availableForPayout: Math.max(0, dueToOrg),
    };
}
