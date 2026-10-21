const emailKey = (value) => String(value || '').trim().toLowerCase();

export function divisionTeamLimit(division) {
    const limit = Number(division?.entry_limit);
    return Number.isInteger(limit) && limit > 0 ? limit : null;
}

// Match reciprocal pairs first, then one-way partner reservations. A player can
// belong to only one pair; chains of partner links never collapse into one team.
export function countDivisionPlaces(registrations = []) {
    const preferred = new Map();
    for (const row of registrations) {
        if (emailKey(row.status) === 'withdrawn') continue;
        const key = emailKey(row.email) || `id:${row.id}`;
        const previous = preferred.get(key);
        const score = (r) => [emailKey(r.payment_status) === 'paid' ? 1 : 0, emailKey(r.partner_email) ? 1 : 0, String(r.created_at || ''), String(r.id || '')];
        const compare = (a, b) => {
            const left = score(a), right = score(b);
            for (let i = 0; i < left.length; i++) {
                if (left[i] !== right[i]) return left[i] > right[i] ? 1 : -1;
            }
            return 0;
        };
        if (!previous || compare(row, previous) > 0) preferred.set(key, row);
    }
    const rows = [...preferred].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
    const paired = new Set();
    let pairs = 0;
    for (const mutualOnly of [true, false]) {
        for (const [key, row] of rows) {
            if (paired.has(key)) continue;
            const match = rows.find(([otherKey, other]) => otherKey !== key && !paired.has(otherKey)
                && (mutualOnly
                    ? emailKey(row.partner_email) === otherKey && emailKey(other.partner_email) === key
                    : emailKey(row.partner_email) === otherKey || emailKey(other.partner_email) === key));
            if (match) {
                paired.add(key);
                paired.add(match[0]);
                pairs++;
            }
        }
    }
    return rows.length - pairs;
}

// Reserve tournament entries as pending before opening the payment gateway.
// The RPC and database trigger recheck the roster atomically under a lock.
export async function reserveDivisionPlaces(client, rows, soloLinks = []) {
    if (!rows?.length) return;
    const { error } = await client.rpc('reserve_event_registration_places', {
        p_rows: rows,
        p_solo_links: soloLinks,
    });
    if (error) throw error;
}
