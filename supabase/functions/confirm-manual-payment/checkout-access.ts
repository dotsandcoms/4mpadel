/** Use the caller's JWT so the database checks live session and event scope. */
export async function canConfirmEventCheckout(
    caller: { rpc: (name: string, args: { p_reference: string }) => PromiseLike<{ data: { state?: string } | null; error: unknown }> },
    reference: string,
): Promise<boolean> {
    const { data, error } = await caller.rpc('event_checkout_state', { p_reference: reference });
    return !error && ['awaiting_payment', 'expired', 'paid', 'review'].includes(data?.state || '');
}
