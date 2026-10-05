const normalizeName = (value) => String(value || '').trim().toLowerCase();

// A division's name can change after entry. Its linked ID remains authoritative.
export function resolveRegistrationDivision(registration, divisions = []) {
    if (!registration) return null;
    const linked = registration.division_id
        ? divisions.find((division) => division.id === registration.division_id)
        : null;
    if (linked) return linked;
    const name = normalizeName(registration.division);
    return name ? divisions.find((division) => normalizeName(division.name) === name) || null : null;
}

export function registrationMatchesDivision(registration, division, divisions = []) {
    if (!registration || !division) return false;
    const resolved = resolveRegistrationDivision(registration, divisions);
    if (!resolved) return false;
    return resolved.id && division.id
        ? resolved.id === division.id
        : normalizeName(resolved.name) === normalizeName(division.name);
}

export function registrationDivisionKey(registration, divisions = []) {
    const id = resolveRegistrationDivision(registration, divisions)?.id || registration?.division_id;
    return id ? `id:${id}` : `name:${normalizeName(registration?.division)}`;
}

export function registrationsShareDivision(left, right, divisions = []) {
    return Boolean(left && right)
        && registrationDivisionKey(left, divisions) !== 'name:'
        && registrationDivisionKey(left, divisions) === registrationDivisionKey(right, divisions);
}

export function buildRegistrationTeamsByDivision(registrations, divisions, orderPlayers = (players) => players) {
    const result = {};
    divisions.forEach((division) => {
        const rows = registrations.filter((registration) =>
            String(registration.status || '').toLowerCase() !== 'withdrawn'
            && registrationMatchesDivision(registration, division, divisions));
        const processed = new Set();
        result[division.name] = [];
        rows.forEach((registration) => {
            if (processed.has(registration.id)) return;
            processed.add(registration.id);
            const partnerEmail = normalizeName(registration.partner_email);
            const partner = partnerEmail && rows.find((row) =>
                row.id !== registration.id && !processed.has(row.id)
                && normalizeName(row.email) === partnerEmail);
            if (partner) processed.add(partner.id);
            const players = orderPlayers(partner ? [registration, partner] : [registration]);
            result[division.name].push({ id: `team_${players[0].id}`, players });
        });
    });
    return result;
}
