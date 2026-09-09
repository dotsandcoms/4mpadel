const normalizeEmail = (email) => (email || '').trim().toLowerCase();

// Validate the entire entry before releasing withdrawn slots or inserting either teammate.
export async function createPendingRegistrations(client, payloads) {
    if (!payloads.length) throw new Error('Select a player');
    const emails = payloads.map((row) => normalizeEmail(row.email));
    if (emails.some((email) => !email)) throw new Error('Every player needs an email address');
    if (new Set(emails).size !== emails.length) throw new Error('Select two different teammates');
    const { event_id: eventId, division } = payloads[0];
    if (payloads.some((row) => row.event_id !== eventId || row.division !== division)) {
        throw new Error('Teammates must enter the same event and division');
    }
    const { data: rows, error: lookupError } = await client
        .from('event_registrations')
        .select('id, email, partner_email, status')
        .eq('event_id', eventId)
        .eq('division', division);
    if (lookupError) throw lookupError;
    for (const player of payloads) {
        const email = normalizeEmail(player.email);
        if ((rows || []).some((row) => row.status !== 'withdrawn'
            && [row.email, row.partner_email].some((value) => normalizeEmail(value) === email))) {
            throw new Error(`${player.full_name || 'This player'} is already entered in ${division}`);
        }
    }
    const withdrawn = (rows || []).filter((row) => row.status === 'withdrawn' && emails.includes(normalizeEmail(row.email)));
    for (const row of withdrawn) {
        const { error } = await client.from('event_registrations')
            .update({ division: `__archived__/${row.id}`, division_id: null }).eq('id', row.id);
        if (error) throw error;
    }
    // One INSERT makes creating both linked rows atomic: neither can be saved alone.
    const { data, error } = await client.from('event_registrations').insert(payloads.map((row) => ({
        ...row,
        email: normalizeEmail(row.email),
        payment_status: 'pending',
        payment_method: null,
        status: 'registered',
    }))).select('id, pay_token');
    if (error?.code === '23505') throw new Error('A selected player is already entered in this division');
    if (error) throw error;
    return { data, replacedWithdrawn: withdrawn.length > 0 };
}
