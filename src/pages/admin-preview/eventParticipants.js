import { readAll } from './playersData.js';
import { eventSnapshot } from './eventSnapshots.js';
import { hydrateEventLicenses, eventLicenseCategory } from './eventLicenseData.js';

export async function readEventParticipants(client, eventId, signal) {
  // Same source and relation as EventFinance's RankedIn event branch.
  const rows = await readAll(() => client.from('tournament_participants')
    .select('*, players(id,name,email,contact_number,license_type,paid_registration,temporary_licenses(id,event_id,revoked_at))')
    .eq('event_id', eventId).order('id'), signal);
  const players = await hydrateEventLicenses(client, rows.map(row => row.players).filter(Boolean), eventId, signal);
  const byId = new Map(players.map(player => [String(player.id), player]));
  return rows.map(row => ({ ...row, players: byId.get(String(row.players?.id)) || row.players }));
}

export function participantSnapshot(event, participants) {
  return eventSnapshot(event, [], participants, participants.map(row => row.players).filter(Boolean), []);
}

export function participantLicence(row, eventId) {
  const authoritative = eventLicenseCategory(row.players, eventId);
  if (authoritative) return authoritative === 'full' ? 'Full licence' : authoritative === 'temp' ? 'Temporary licence' : 'No licence';
  if (row.players?.license_type === 'full') return 'Full licence';
  if (row.players?.temporary_licenses?.some(licence => !licence.revoked_at && String(licence.event_id) === String(eventId))) return 'Temporary licence';
  return 'No licence';
}
