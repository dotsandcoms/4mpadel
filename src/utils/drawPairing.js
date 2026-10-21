export function pairRegistrations(registrations, pairs = []) {
    const byId = new Map(registrations.map(r => [r.id, r]));
    const used = new Set();
    const teams = [];
    for (const pair of pairs) {
        const [a,b] = pair.map(id => byId.get(id));
        if (!a || !b || a.id === b.id || used.has(a.id) || used.has(b.id)) throw new Error('Each included player must appear in exactly one pair.');
        used.add(a.id); used.add(b.id);
        teams.push({...a,partner_registration_id:b.id,partner_name:b.full_name,partner_email:b.email});
    }
    if (used.size !== registrations.length) throw new Error('Pair every included player before confirming.');
    return teams;
}
