import { registrationDivisionKey, registrationsShareDivision } from './registrationDivision.js';

const emailKey = (value) => String(value || '').trim().toLowerCase();
const isActive = (registration) => registration && String(registration.status || '').toLowerCase() !== 'withdrawn';
const sameScope = (left, right, divisions) => String(left.event_id) === String(right.event_id)
    && registrationsShareDivision(left, right, divisions);

// Include one-way reservations when checking whether a third player is involved.
const activeLinksFor = (registration, registrations, divisions) => registrations.filter((other) => isActive(other)
        && other.id !== registration.id
        && emailKey(other.email) !== emailKey(registration.email)
        && sameScope(registration, other, divisions)
        && ((emailKey(registration.partner_email) && emailKey(registration.partner_email) === emailKey(other.email))
            || (emailKey(other.partner_email) && emailKey(other.partner_email) === emailKey(registration.email))));

export function findRegistrationTeammate(registration, registrations, divisions = []) {
    if (!isActive(registration) || !emailKey(registration.email)) return null;
    return activeLinksFor(registration, registrations, divisions)[0] || null;
}

export function eligibleRegistrationTeamPartners(registration, registrations, divisions = [], search = '') {
    if (!isActive(registration) || !emailKey(registration.email)) return [];
    const query = search.trim().toLowerCase();
    const existingLinks = activeLinksFor(registration, registrations, divisions);
    return registrations.filter((other) => isActive(other)
        && other.id !== registration.id
        && emailKey(other.email)
        && emailKey(other.email) !== emailKey(registration.email)
        && sameScope(registration, other, divisions)
        // Allow the selected pair to complete their own one-way reservation.
        // Any link involving a third player still prevents a merge.
        && existingLinks.every((linked) => linked.id === other.id)
        && activeLinksFor(other, registrations, divisions).every((linked) => linked.id === registration.id)
        && !(emailKey(registration.partner_email) === emailKey(other.email)
            && emailKey(other.partner_email) === emailKey(registration.email))
        && (!query || [other.full_name, other.email].filter(Boolean).join(' ').toLowerCase().includes(query)));
}

export async function manageRegistrationTeam(client, action, registration, other, divisions = []) {
    const { data, error } = await client.rpc('manage_registration_team', {
        p_action: action,
        p_registration_id: registration.id,
        p_other_registration_id: other.id,
        p_division_key: registrationDivisionKey(registration, divisions),
    });
    if (error) throw error;
    return data;
}

