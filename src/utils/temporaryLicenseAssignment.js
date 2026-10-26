// License issuance is atomic and permission checked by the existing admin RPC.
export async function grantTemporaryLicense(client, input) {
    const playerId = Number(input.player_id);
    const eventId = Number(input.event_id);
    if (!Number.isSafeInteger(playerId) || playerId <= 0) throw new Error('Select a player.');
    if (!Number.isSafeInteger(eventId) || eventId <= 0) throw new Error('Select an event.');

    const reason = String(input.reason || '').trim();
    if (!reason) throw new Error('Enter a reason for this assignment.');
    if (!['manual', 'complimentary'].includes(input.source)) {
        throw new Error('Choose manual payment or complimentary.');
    }

    const values = {
        player_id: playerId,
        event_id: eventId,
        license_type: 'temporary',
        source: input.source,
        reason,
    };
    if (input.source === 'manual') {
        const amount = Number(input.amount);
        if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter the amount received.');
        if (!['cash', 'eft'].includes(input.payment_method)) throw new Error('Choose cash or EFT.');
        Object.assign(values, {
            amount,
            payment_method: input.payment_method,
            receipt: String(input.receipt || '').trim(),
        });
    }

    const { data, error } = await client.rpc('manage_license', { p_action: 'grant', p_input: values });
    if (error) throw error;
    if (!data?.saved || !data.id) throw new Error('The license assignment was not confirmed. Please check the player’s licenses before retrying.');
    return data;
}
