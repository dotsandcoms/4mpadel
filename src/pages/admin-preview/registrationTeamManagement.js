// Division resolution and eligibility retained from current MAIN registrationDivision.js / registrationTeams.js.
import { readAll } from './playersData.js';
import { verifyEventOperationAccess } from './eventOperationAccess.js';
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


const same = (a,b) => String(a) === String(b);
const reviewFields = ['id','event_id','email','full_name','division_id','division','status','partner_email','partner_name'];
const snapshot = row => JSON.stringify(reviewFields.map(key => row?.[key] ?? null));
export async function saveRegistrationTeam({client,event,registration,other,action,expectedUserId,scopeId='all',verifyAccess=verifyEventOperationAccess,isCurrent=()=>true,onAttempt=()=>{}}) {
  if (!['merge','split'].includes(action) || !registration?.id || !other?.id || !same(registration.event_id,event?.id) || !same(other.event_id,event.id)) throw new Error('Select two entries in this event.');
  const access = await verifyAccess({client,eventId:event.id,expectedUserId,scopeId});
  if (!isCurrent()) throw new Error('The workspace changed. Close and reopen this action.');
  if (!same(access?.event?.id,event.id)) throw new Error('Event access could not be confirmed.');
  const [rows,divisions] = await Promise.all([
    readAll(()=>client.from('event_registrations').select('*').eq('event_id',event.id).order('id')),
    readAll(()=>client.from('tournament_divisions').select('id,name').eq('event_id',event.id).order('id')),
  ]);
  const first=rows.find(row=>same(row.id,registration.id)), second=rows.find(row=>same(row.id,other.id));
  if (!first || !second || snapshot(first)!==snapshot(registration) || snapshot(second)!==snapshot(other)) throw new Error('The selected entries changed. Close and refresh before continuing.');
  const eligible=action==='merge' ? eligibleRegistrationTeamPartners(first,rows,divisions).some(row=>same(row.id,second.id)) : same(findRegistrationTeammate(first,rows,divisions)?.id,second.id);
  if (!eligible) throw new Error('These entries can no longer be changed together. Close and refresh.');
  const key=registrationDivisionKey(first,divisions);
  await verifyAccess({client,eventId:event.id,expectedUserId,scopeId});
  if (!isCurrent()) throw new Error('The workspace changed. Close and reopen this action.');
  onAttempt();
  const {data,error}=await client.rpc('manage_registration_team',{p_action:action,p_registration_id:first.id,p_other_registration_id:second.id,p_division_key:key});
  if(error) throw error;
  if (!data || data.division_key!==key || !Array.isArray(data.registration_ids) || data.registration_ids.length!==2 || !data.registration_ids.some(id=>same(id,first.id)) || !data.registration_ids.some(id=>same(id,second.id))) throw new Error('The saved team could not be confirmed. Refresh before trying again.');
  return data;
}
