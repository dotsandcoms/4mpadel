import { readAll } from './playersData.js';
import { eventSnapshot } from './eventSnapshots.js';
import { buildRankedinTournamentUrl, extractRankedinId } from '../../utils/rankedinLink.js';
import { hydrateEventLicenses, eventLicenseCategory } from './eventLicenseData.js';

export async function readEventParticipants(client, eventId, signal) {
  // Same source and relation as EventFinance's RankedIn event branch.
  const rows = await readAll(() => client.from('tournament_participants')
    .select('*, players(id,name,email,contact_number,license_type,paid_registration,temporary_licenses(id,event_id,revoked_at))')
    .eq('event_id', eventId).order('id'), signal);
  if (rows.some(row => String(row.event_id) !== String(eventId))) throw new Error('The participant list includes records from another event.');
  const players = await hydrateEventLicenses(client, rows.map(row => row.players).filter(Boolean), eventId, signal);
  const byId = new Map(players.map(player => [String(player.id), player]));
  return rows.map(row => ({ ...row, players: byId.get(String(row.players?.id)) || row.players }));
}

export function participantSnapshot(event, participants) {
  return eventSnapshot(event, [], participants, participants.map(row => row.players).filter(Boolean), []);
}

export function participantLicenceType(row, eventId) {
  const authoritative = eventLicenseCategory(row.players, eventId);
  if (authoritative) return authoritative;
  if (row.players?.license_type === 'full') return 'full';
  if (row.players?.temporary_licenses?.some(licence => !licence.revoked_at && String(licence.event_id) === String(eventId))) return 'temp';
  return 'none';
}

export const PARTICIPANT_LICENCES = { full: 'Full licence', temp: 'Temporary licence', none: 'No licence' };
export const participantLicence = (row, eventId) => PARTICIPANT_LICENCES[participantLicenceType(row, eventId)];
export const participantName = row => row.full_name || row.players?.name || 'Name not recorded';
export const linkedParticipant = row => Boolean(row.profile_id || row.players?.id);

export function filterEventParticipants(rows, eventId, filters) {
  const search = filters.query?.trim().toLowerCase() || '';
  return rows.filter(row => (!filters.division || row.class_name === filters.division)
    && (!filters.profile || linkedParticipant(row) === (filters.profile === 'linked'))
    && (!filters.licence || participantLicenceType(row, eventId) === filters.licence)
    && (!filters.payment || (row.is_paid === true) === (filters.payment === 'paid'))
    && (!filters.whatsapp || (row.whatsapp_added === true) === (filters.whatsapp === 'added'))
    && [participantName(row), row.email, row.players?.name, row.players?.email, row.class_name].some(value => String(value || '').toLowerCase().includes(search)))
    .sort((a, b) => String(a.class_name || '').localeCompare(String(b.class_name || '')) || participantName(a).localeCompare(participantName(b)));
}

export function publicParticipantTournament(event) {
  const id = extractRankedinId(event.rankedin_id);
  try {
    const url = new URL(event.rankedin_url);
    if (url.protocol === 'https:' && ['rankedin.com', 'www.rankedin.com'].includes(url.host)
      && !url.username && !url.password) {
      const linkedId = url.pathname.match(/\/(?:tournament|clubleague|draws|results)\/(\d+)(?:\/|$)/i)?.[1];
      if (linkedId && (!id || id === linkedId)) return url.href;
    }
  } catch { /* Use the validated tournament ID if the recorded URL is unavailable. */ }
  return buildRankedinTournamentUrl(id);
}
