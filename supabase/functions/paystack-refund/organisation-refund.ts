import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export async function refundOrganisationPayment(
    secret: string,
    reference: string,
    amountCents: number,
    admin: SupabaseClient,
    refundRowId: string | undefined,
    mode: 'submit' | 'reconcile' = 'submit',
): Promise<{ ok: boolean; refundId: string | null; status: string; message: string; fundedBy?: string }> {
    const failed = (message: string, status = 'failed') => ({ ok: false, refundId: null, status, message });
    if (!refundRowId) return failed('The refund record could not be saved.');
    const { data: claim, error } = await admin.rpc('claim_paystack_split_refund', {
        p_reference: reference,
        p_refund_id: refundRowId,
        p_amount_cents: amountCents,
        p_funding_confirmed: Deno.env.get('PAYSTACK_ORGANISATION_REFUND_FUNDING') === 'confirmed',
    });
    if (error) return failed(error.message);
    if (!claim) return failed('The subaccount refund could not be verified.');
    if (!secret.startsWith(claim.domain === 'test' ? 'sk_test_' : 'sk_live_')) {
        return failed('The refund environment does not match the original payment.');
    }
    const auth = { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' };
    const readSplitRefund = (data: Record<string, any>) => {
        if (data.reference !== claim.reference || data.domain !== claim.domain
            || data.currency !== 'ZAR' || Number(data.amount) !== amountCents
            || (data.transaction?.reference ?? data.transaction_reference) !== reference
            || data.id == null) return null;
        const status = String(data.status || 'pending').replace('-', '_');
        if (!['pending', 'processing', 'processed', 'failed', 'needs_attention'].includes(status)) return null;
        return { ok: ['pending', 'processing', 'processed'].includes(status), refundId: String(data.id),
            status, message: 'Paystack refund status: ' + status, fundedBy: claim.fundedBy };
    };
    if (mode === 'submit') {
        try {
            const res = await fetch('https://api.paystack.co/refund', {
                method: 'POST', headers: auth, signal: AbortSignal.timeout(12000),
                body: JSON.stringify({ transaction: reference, amount: amountCents, reference: claim.reference }),
            });
            const body = await res.json();
            if (body?.status === true && body?.data) {
                const direct = readSplitRefund(body.data);
                if (direct) return direct;
            } else if (res.status !== 409 && res.status < 500) {
                return failed(String(body?.message || 'Refund failed'));
            }
        } catch { /* Check the original provider refund reference after a timeout. */ }
    }
    try {
        const res = await fetch(`https://api.paystack.co/refund?reference=${encodeURIComponent(claim.reference)}`, {
            headers: auth, signal: AbortSignal.timeout(12000),
        });
        const body = await res.json();
        if (res.ok && body.status === true && Array.isArray(body.data)) {
            const result = body.data.map(readSplitRefund).find(Boolean);
            if (result) return result;
        }
    } catch { /* Reuse the same refund reference on a retry. */ }
    return failed('Refund outcome is unconfirmed. Check the original Paystack refund before retrying.', 'needs_attention');
}
