import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getPaystackSecretKeys, parseMetadata, resolvePaystackVerifySecrets } from './paystack.ts';
import { resolvePaystackGatewayReference, toPaystackCents, type PaymentRow } from './refund-engine.ts';

export const REVIEWED_REFUND_PREFIX = '4m-refund-';
const BASE_URL = 'https://api.paystack.co';
const readObject = (value: unknown): Record<string, unknown> => {
    const parsed = parseMetadata(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
};
const refundStatuses = new Map([
    ['pending', 'processing'], ['processing', 'processing'], ['processed', 'processed'],
    ['failed', 'failed'], ['needs-attention', 'needs_attention'], ['needs_attention', 'needs_attention'],
]);

export async function canReviewEventRefund({ bearer, serviceKey, actor, email }: {
    bearer: string; serviceKey: string; actor?: SupabaseClient; email?: string;
}): Promise<boolean> {
    // Some deployments have gateway JWT checks disabled. A decoded role claim is
    // not service authentication. Exact configured credentials remain supported.
    if (serviceKey && bearer === serviceKey) return true;
    if (!actor || !email) return false;
    const [active, admin] = await Promise.all([actor.rpc('account_is_active'), actor.rpc('is_super_admin', { user_email: email })]);
    return !active.error && active.data === true && !admin.error && admin.data === true;
}

export function reviewedRefundClaim(metadata: unknown): Record<string, unknown> {
    return readObject(readObject(metadata).reviewed_retry);
}

async function paystack(path: string, secret: string, init?: RequestInit): Promise<{ ok: boolean; body: Record<string, unknown> }> {
    try {
        const response = await fetch(`${BASE_URL}${path}`, {
            ...init, signal: AbortSignal.timeout(10000),
            headers: { Authorization: `Bearer ${secret}`, ...(init?.headers || {}) },
        });
        return { ok: response.ok, body: readObject(await response.json()) };
    } catch {
        // A POST may have reached Paystack. The saved claim remains held.
        return { ok: false, body: {} };
    }
}

async function verifyOriginalTransaction(payment: Record<string, unknown>, amountCents: number) {
    const reference = resolvePaystackGatewayReference(payment as PaymentRow);
    if (!reference) return null;
    const { secrets, mode } = resolvePaystackVerifySecrets(payment);
    const keys = getPaystackSecretKeys();
    for (const secret of secrets) {
        const response = await paystack(`/transaction/verify/${encodeURIComponent(reference)}`, secret);
        if (!response.ok || response.body.status !== true) continue;
        const row = readObject(response.body.data);
        const id = String(row.id ?? '');
        const domain = String(row.domain ?? '');
        if (row.reference === reference && /^[1-9][0-9]*$/.test(id) && row.currency === 'ZAR'
            && ['live', 'test'].includes(domain) && (mode === 'unknown' || domain === mode)
            && (domain === 'live' ? keys.live : keys.test) === secret
            && Number.isSafeInteger(Number(row.amount)) && Number(row.amount) >= amountCents
            && ['success', 'reversed', 'reversal pending', 'reversal_pending'].includes(String(row.status))) {
            return { reference, id, domain, secret, cents: Number(row.amount) };
        }
    }
    return null;
}

export function matchReviewedRefund(raw: unknown, { reference, transactionReference, transactionId, domain, amountCents, providerId }: {
    reference?: string; transactionReference: string; transactionId: string; domain: string; amountCents: number; providerId?: string;
}) {
    const refund = readObject(raw);
    const id = String(refund.id ?? '');
    const suppliedReference = refund.refund_reference || refund.reference;
    const transaction = refund.transaction;
    const original = readObject(transaction);
    const actualTransaction = refund.transaction_reference || original.reference;
    const actualId = (typeof transaction === 'object' && transaction !== null) ? original.id : transaction;
    const status = refundStatuses.get(String(refund.status));
    if (!status || !/^[1-9][0-9]*$/.test(id) || (providerId && id !== providerId)
        || (reference && suppliedReference !== reference) || refund.currency !== 'ZAR' || refund.domain !== domain
        || Number(refund.amount) !== amountCents || (!actualTransaction && actualId == null)
        || (actualTransaction && actualTransaction !== transactionReference)
        || (actualId != null && String(actualId) !== transactionId)) return null;
    return { id, status };
}

type RefundTransaction = { reference: string; id: string; domain: string; secret: string };

async function findReviewedRefundByReference(ref: string, transaction: RefundTransaction, amountCents: number) {
    const response = await paystack(`/refund?reference=${encodeURIComponent(ref)}`, transaction.secret);
    if (!response.ok || response.body.status !== true || !Array.isArray(response.body.data) || response.body.data.length !== 1) return null;
    return matchReviewedRefund(response.body.data[0], {
        reference: ref, transactionReference: transaction.reference, transactionId: transaction.id, domain: transaction.domain, amountCents,
    });
}

async function submitReviewedPaystackRefund(reference: string, transaction: RefundTransaction, amountCents: number) {
    const response = await paystack('/refund', transaction.secret, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transaction: transaction.reference, amount: amountCents, currency: 'ZAR', reference }),
    });
    const direct = response.ok && response.body.status === true ? matchReviewedRefund(response.body.data, {
        reference, transactionReference: transaction.reference, transactionId: transaction.id, domain: transaction.domain, amountCents,
    }) : null;
    return direct || await findReviewedRefundByReference(reference, transaction, amountCents);
}

export async function handleReviewedRefundRetry(service: SupabaseClient, opts: {
    refundId?: string; registrationId?: string; eventId?: string | number; email: string; review: boolean; reconcile: boolean;
    initialDivisionSwitch?: boolean; eventManager?: boolean;
    json: (status: number, body: unknown) => Response;
}) {
    const { refundId, registrationId, eventId, email, review, json, initialDivisionSwitch } = opts;
    if (!refundId || ((review || opts.reconcile || eventId != null || registrationId != null)
        && (!registrationId || !Number.isSafeInteger(Number(eventId)) || Number(eventId) <= 0))) {
        return json(400, { error: 'Choose a saved refund and its exact event registration.' });
    }
    const { data: refund, error: refundError } = await service.from('payment_refunds').select('*').eq('id', refundId).maybeSingle();
    if (refundError) throw refundError;
    if (!refund?.payment_id || !refund.event_registration_id || (registrationId && refund.event_registration_id !== registrationId)) {
        return json(404, { error: 'Refund not found for this registration.' });
    }
    const [registrationResult, paymentResult] = await Promise.all([
        service.from('event_registrations').select('id,event_id').eq('id', refund.event_registration_id).maybeSingle(),
        service.from('payments').select('*').eq('id', refund.payment_id).maybeSingle(),
    ]);
    if (registrationResult.error || paymentResult.error) throw registrationResult.error || paymentResult.error;
    const registration = registrationResult.data;
    const payment = paymentResult.data;
    if (!registration || !payment || payment.status !== 'success' || String(payment.event_id) !== String(registration.event_id)
        || (eventId != null && String(eventId) !== String(registration.event_id))) {
        return json(404, { error: 'The saved payment and refund must belong to this exact event registration.' });
    }
    const amountCents = toPaystackCents(Number(refund.amount));
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || refund.currency !== 'ZAR') {
        return json(400, { error: 'Refund requires a positive recorded ZAR amount.' });
    }
    const metadata = readObject(refund.metadata);
    const prior = reviewedRefundClaim(metadata);
    if (initialDivisionSwitch) {
        if (refund.reason !== 'division_switch' || metadata.verify_failed !== true || metadata.verified_switch_reservation !== true) {
            return json(409, { error: 'This refund requires organiser review.' });
        }
        // Self-service can start the reserved refund once, or reconcile a
        // previously held request. A definitive failure requires admin review.
        if (prior.phase !== 'held' && (prior.reference || refund.paystack_refund_id || refund.status !== 'failed')) {
            return json(200, { status: refund.status });
        }
    }
    const reconcile = opts.reconcile || Boolean(initialDivisionSwitch && prior.phase === 'held');
    const method = String(payment.payment_method || 'paystack').toLowerCase();
    const held = () => json(409, {
        error: 'Refund outcome is unconfirmed. The refund remains held for Paystack reconciliation.',
        status: 'needs_attention', retry_held: true,
    });
    const apply = async (reference: string, id: string | null, status: string) => {
        const { data, error } = await service.rpc('apply_event_refund_retry_evidence', {
            p_refund_id: refund.id, p_event_id: registration.event_id, p_registration_id: registration.id,
            p_reference: reference, p_provider_id: id, p_status: status,
        });
        if (error) throw error;
        if (!data || data.id !== refund.id) return json(409, { error: 'Refund review changed. Reload this registration.' });
        return json(200, {
            status: data.status, retried: !reconcile && ['processing', 'processed'].includes(data.status), reconciled: reconcile,
            amount_rands: amountCents / 100, paystack_refund_id: data.paystack_refund_id,
            paystack_reference: method === 'paystack' ? String(prior.transaction_reference || resolvePaystackGatewayReference(payment)) : refund.paystack_reference,
            retry_reference: reference, ...(method !== 'paystack' ? { cash: true } : {}),
        });
    };
    if (reconcile) {
        const reference = String(prior.reference || '');
        const domain = String(prior.domain || '');
        const keys = getPaystackSecretKeys();
        const secret = domain === 'live' ? keys.live : domain === 'test' ? keys.test : '';
        if (!reference.startsWith(REVIEWED_REFUND_PREFIX) || prior.method !== 'paystack' || !secret) {
            return json(409, { error: 'No Paystack retry reference is available for this refund.' });
        }
        const transaction = { domain, secret, reference: String(prior.transaction_reference), id: String(prior.transaction_id) };
        let evidence = await findReviewedRefundByReference(reference, transaction, amountCents);
        if (!evidence && prior.phase === 'verified' && refund.paystack_refund_id) {
            const response = await paystack(`/refund/${encodeURIComponent(refund.paystack_refund_id)}`, secret);
            if (response.ok && response.body.status === true) evidence = matchReviewedRefund(response.body.data, {
                providerId: refund.paystack_refund_id, transactionReference: transaction.reference, transactionId: transaction.id, domain, amountCents,
            });
        }
        if (!evidence) return held();
        return await apply(reference, evidence.id, evidence.status);
    }
    if (prior.phase === 'held') return held();
    if (refund.status !== 'failed') return json(409, { error: 'Only a failed refund can start a retry.', status: refund.status });
    const cash = method === 'cash' || method === 'manual';
    if (!cash && method !== 'paystack') return json(409, { error: 'This refund method requires a manual review.' });
    if (cash && refund.paystack_refund_id) return json(409, { error: 'This cash refund has a Paystack record and requires a manual review.' });

    if (!cash && !refund.paystack_refund_id && !(metadata.verify_failed === true && !metadata.retried_at)) {
        return json(409, { error: 'The earlier refund has no Paystack ID or confirmed pre-submission failure. Verify it manually before a new attempt.' });
    }
    const transaction = cash ? null : await verifyOriginalTransaction(payment, amountCents);
    if (!cash && !transaction) return json(409, { error: 'The original Paystack payment could not be verified in its recorded environment.' });
    let previous = null;
    if (transaction && refund.paystack_refund_id) {
        const response = await paystack(`/refund/${encodeURIComponent(refund.paystack_refund_id)}`, transaction.secret);
        previous = response.ok && response.body.status === true ? matchReviewedRefund(response.body.data, {
            providerId: refund.paystack_refund_id, transactionReference: transaction.reference,
            transactionId: transaction.id, domain: transaction.domain, amountCents,
        }) : null;
        if (!previous) return json(409, { error: 'The previous Paystack refund could not be matched exactly. Review it before retrying.' });
    }

    const { data: claim, error: claimError } = await service.rpc('claim_event_refund_retry', {
        p_refund_id: refund.id, p_event_id: registration.event_id, p_registration_id: registration.id, p_payment_id: payment.id,
        p_amount: Number(refund.amount), p_previous_id: refund.paystack_refund_id || null, p_previous_retry: prior.reference || null,
        p_method: method, p_transaction_ref: transaction?.reference || null, p_transaction_id: transaction?.id || null,
        p_transaction_cents: transaction?.cents || null, p_domain: transaction?.domain || null,
        p_actor: email === 'service-role' || (initialDivisionSwitch && !opts.eventManager) ? email : `admin:${email}`,
        p_reconcile_only: Boolean(previous && previous.status !== 'failed'),
    });
    if (claimError) throw claimError;
    if (claim?.unavailable) return json(409, { error: 'The saved refund exceeds the remaining allowance on its original payment.' });
    const reference = String(claim?.reference || '');
    if (!reference.startsWith(REVIEWED_REFUND_PREFIX)) return json(409, { error: 'Another reviewer already changed this refund. Reload its status.' });
    if (!transaction) return await apply(reference, null, 'processed');
    if (previous && previous.status !== 'failed') return await apply(reference, previous.id, previous.status);

    const evidence = await submitReviewedPaystackRefund(reference, transaction, amountCents);
    if (!evidence) return held();
    return await apply(reference, evidence.id, evidence.status);
}
