const normaliseEmail = (value) => String(value || '').trim().toLowerCase();

// Reciprocal registrations share a team. Retain both rows for eligibility
// checks and choose a stable representative for the lineup.
export function groupPairRegistrations(registrations) {
    const teams = new Map();
    registrations.forEach((registration) => {
        const playerEmail = normaliseEmail(registration.email);
        const partnerEmail = normaliseEmail(registration.partner_email);
        const pairEmails = [playerEmail, partnerEmail].filter(Boolean).sort();
        const key = pairEmails.length === 2
            ? `pair:${pairEmails.join(':')}`
            : `single:${registration.id}`;
        const group = teams.get(key);
        if (!group) {
            teams.set(key, { registration, members: [registration] });
            return;
        }
        group.members.push(registration);
        const existing = group.registration;
        const existingScore = Number(Boolean(existing.partner_name)) + Number(Boolean(existing.partner_email));
        const candidateScore = Number(Boolean(registration.partner_name)) + Number(Boolean(registration.partner_email));
        if (candidateScore > existingScore || (
            candidateScore === existingScore
            && String(registration.created_at || '') < String(existing.created_at || '')
        )) {
            group.registration = registration;
        }
    });
    return [...teams.values()];
}

export function dedupePairRegistrations(registrations, { keepStandalonePlayers = false } = {}) {
    const uniqueTeams = groupPairRegistrations(registrations).map(group => group.registration);
    if (keepStandalonePlayers) return uniqueTeams;

    // A player may have registered alone before a teammate named them as a
    // partner. Their solo row is still reviewed for eligibility, but must not
    // become an extra draw entry alongside that complete pair.
    const pairedEmails = new Set();
    uniqueTeams.forEach((registration) => {
        const playerEmail = normaliseEmail(registration.email);
        const partnerEmail = normaliseEmail(registration.partner_email);
        if (playerEmail && partnerEmail && playerEmail !== partnerEmail && registration.partner_name?.trim()) {
            pairedEmails.add(playerEmail);
            pairedEmails.add(partnerEmail);
        }
    });
    return uniqueTeams.filter((registration) => registration.partner_name?.trim()
        || normaliseEmail(registration.partner_email)
        || !pairedEmails.has(normaliseEmail(registration.email)));
}

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
