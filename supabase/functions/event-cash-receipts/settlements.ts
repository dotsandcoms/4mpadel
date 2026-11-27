type SplitReceipt = { reference: string; provider_id: number; verified_at: string | null };
type Payout = { settlement_status: string; settlement_id: string };

export async function eventSubaccountPayouts(
    receipts: Record<string, unknown>[],
    splits: SplitReceipt[],
    secret: string,
) {
    const groups = new Map<number, Map<string, Record<string, unknown>>>();
    for (const split of splits) {
        const receipt = receipts.find(row => row.reference === split.reference);
        if (!receipt || !split.verified_at) continue;
        const group = groups.get(split.provider_id) || new Map();
        group.set(split.reference, receipt);
        groups.set(split.provider_id, group);
    }
    const matches = new Map<string, Payout>();
    const get = async (path: string) => {
        const response = await fetch(`https://api.paystack.co${path}`, {
            headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(3000),
        });
        const payload = await response.json();
        if (!response.ok || payload.status !== true || !Array.isArray(payload.data)) throw new Error('Settlement unavailable');
        return payload;
    };
    // Payout evidence is optional and bounded. Never infer a payout from a
    // successful charge or match another event's receipts to a batch.
    for (const [subaccount, charges] of groups) {
        const dates = [...charges.values()].map(charge => String(charge.paid_at || '')).filter(x => !isNaN(Date.parse(x))).sort();
        if (!dates.length) continue;
        const query = new URLSearchParams({ subaccount: String(subaccount), from: dates[0].slice(0, 10), perPage: '20' });
        try {
            const list = await get(`/settlement?${query}`);
            const batches = list.data.filter((item: Record<string, unknown>) => item.domain === 'live'
                && item.currency === 'ZAR' && /^[0-9]+$/.test(String(item.id))).slice(0, 12);
            for (let i = 0; i < batches.length && charges.size; i += 4) {
                await Promise.allSettled(batches.slice(i, i + 4).map(async (batch: Record<string, any>) => {
                    for (let page = 1; page <= 2 && charges.size; page++) {
                        const items = await get(`/settlement/${batch.id}/transactions?perPage=100&page=${page}`);
                        for (const item of items.data) {
                            const original = charges.get(item.reference);
                            if (!original || String(item.id) !== original.provider_charge_id
                                || item.currency !== 'ZAR' || item.domain !== 'live') continue;
                            matches.set(item.reference, { settlement_status: String(batch.status), settlement_id: String(batch.id) });
                            charges.delete(item.reference);
                        }
                        if (!items.meta?.pageCount || page >= items.meta.pageCount) break;
                    }
                }));
            }
        } catch { /* Leave the payout unconfirmed when Paystack is unavailable. */ }
    }
    for (const receipt of receipts) Object.assign(receipt, matches.get(String(receipt.reference)));
}
