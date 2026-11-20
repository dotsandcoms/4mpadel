const referencePattern = /^[A-Za-z0-9._=-]{1,100}$/;
const reviewKinds = ['entry','licence','unallocated'];

export const canReviewGatewayBackfill = (session, permissions, scopeId, row) =>
    Boolean(session?.user?.id && permissions?.role === 'super_admin' && scopeId === 'all'
        && row?.environment === 'live' && row.status === 'success'
        && (row.link?.state === 'unmatched' || (row.link?.state === 'matched' && row.link.unallocated))
        && typeof row.reference === 'string' && referencePattern.test(row.reference));

async function send(client, session, permissions, scopeId, row, input, signal) {
    if (!canReviewGatewayBackfill(session, permissions, scopeId, row)) throw new Error('Select a successful missing or unallocated live receipt in platform Finance.');
    signal?.throwIfAborted();
    const auth = await client.auth.getUser();
    signal?.throwIfAborted();
    if (auth.error || auth.data?.user?.id !== session.user.id) throw new Error('The signed-in account changed. Reopen the gateway.');
    const { data, error } = await client.functions.invoke('admin-paystack-backfill', {
        body: { ...input, scopeId, reference:row.reference }, signal, timeout:25000,
    });
    signal?.throwIfAborted();
    if (error) {
        let result;
        try { result = await error.context?.json(); } catch { /* The host response may not contain JSON. */ }
        throw new Error(result?.error || 'The receipt operation could not be confirmed. Refresh and review it before retrying.');
    }
    if (!data || data.error) throw new Error(data?.error || 'The receipt operation could not be confirmed.');
    return data;
}

export async function reviewGatewayBackfill(client, session, permissions, scopeId, row, signal) {
    const result = await send(client,session,permissions,scopeId,row,{ action:'review' },signal);
    if (result.state !== 'review') return result;
    if (result.reference !== row.reference || result.amountMinor !== row.amountMinor
        || (row.link?.unallocated && result.kind === 'unallocated')
        || !reviewKinds.includes(result.kind) || typeof result.token !== 'string' || !/^[\da-f]{64}$/.test(result.token)) {
        throw new Error('Paystack receipt details changed. Refresh the gateway before reviewing.');
    }
    return result;
}

export async function recordGatewayBackfill(client, session, permissions, scopeId, row, review, reason, signal) {
    if (review?.state !== 'review' || review.reference !== row.reference || !reason.trim()) throw new Error('Review the verified receipt and enter a reason.');
    const result = await send(client,session,permissions,scopeId,row,{ action:'record', token:review.token, reason:reason.trim() },signal);
    if (!['recorded','already_recorded','held','changed'].includes(result.state)) throw new Error('The receipt outcome is unknown. Refresh before retrying.');
    return result;
}
