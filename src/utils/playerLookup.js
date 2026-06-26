export const buildPlayersByEmailMap = (players = []) => {
    const map = new Map();
    for (const p of players) {
        const key = (p.email || '').toLowerCase().trim();
        if (key) map.set(key, p);
    }
    return map;
};

/**
 * Load players by email using case-insensitive matching.
 * Registration/auth emails are often lowercased while legacy player rows keep original casing.
 */
export const fetchPlayersByEmails = async (
    supabaseClient,
    emails,
    select = 'id, name, email, contact_number, license_type, paid_registration, temporary_licenses(id, event_id)',
) => {
    const unique = [...new Set(
        (emails || [])
            .map((email) => (email || '').toLowerCase().trim())
            .filter(Boolean),
    )];
    if (unique.length === 0) return [];

    const chunkSize = 40;
    const all = [];
    for (let i = 0; i < unique.length; i += chunkSize) {
        const chunk = unique.slice(i, i + chunkSize);
        const orFilter = chunk.map((email) => `email.ilike.${email}`).join(',');
        const { data, error } = await supabaseClient
            .from('players')
            .select(select)
            .or(orFilter);
        if (error) {
            console.error('[fetchPlayersByEmails]', error.message);
            continue;
        }
        if (data?.length) all.push(...data);
    }
    return all;
};
