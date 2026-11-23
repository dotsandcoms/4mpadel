/** Report changes confirmed by the 4M entry API without sending ledger details. */
export function entryWithdrawalAnalytics(result) {
    if (result?.processed !== true || !Array.isArray(result.refunds)) return null;

    const entries = result.refunds.filter(item => ['no_refund', 'processing', 'processed', 'needs_attention'].includes(item?.status));
    if (entries.length === 0) return null;

    const refundStarted = entries.filter(item => Number.isFinite(item.refunded_rands) && item.refunded_rands > 0).length;
    return { withdrawn: entries.length, refundStarted };
}
