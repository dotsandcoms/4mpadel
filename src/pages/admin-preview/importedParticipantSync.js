import { extractRankedinId } from '../../utils/rankedinLink.js';
import { createCalendarRankedinGateway } from './calendarRankedinGateway.js';
import { verifyImportedParticipantWrite } from './importedParticipantActions.js';

const operation = 'admin_import_rankedin_participants';
const participantIdPattern = /^[A-Za-z0-9._:-]{1,100}$/;
const reviewedTokenPattern = /^[a-f0-9]{64}$/;
const reviewLifeMs = 2 * 60 * 1000;
const maxRows = 5000;
const order = (left, right) => left < right ? -1 : left > right ? 1 : 0;

export const importedRankedinId = event => extractRankedinId(event.rankedin_id || event.rankedin_url);

export async function loadRankedinParticipantSnapshot(gateway, rankedinId, signal) {
  const tabs = await gateway.participantClasses(rankedinId, signal);
  if (!tabs.length || tabs.length > 100) throw new Error('RankedIn did not return a complete list of divisions.');
  const classIds = new Set();
  const classNames = new Set();
  for (const tab of tabs) {
    const id = String(tab?.Id || '');
    const name = typeof tab?.Name === 'string' ? tab.Name.trim() : '';
    if (!/^[1-9]\d*$/.test(id) || !name || name.length > 200 || classIds.has(id) || classNames.has(name.toLowerCase())) {
      throw new Error('RankedIn returned an invalid or repeated division.');
    }
    classIds.add(id);
    classNames.add(name.toLowerCase());
  }

  const entries = new Map();
  // Fetch every division. A failed or malformed response leaves the current roster intact.
  for (const tab of tabs) {
    const division = tab.Name.trim();
    const teams = await gateway.classParticipants(rankedinId, tab.Id, signal);
    for (const team of teams) {
      if (!team?.FirstPlayer) throw new Error('RankedIn returned an incomplete team in ' + division + '.');
      for (const [position, player] of [team.FirstPlayer, team.SecondPlayer].entries()) {
        const id = String(player?.Id ?? '');
        if (position === 1 && (!player || id === '0')) continue;
        const name = typeof player?.Name === 'string' ? player.Name.trim() : '';
        if (!participantIdPattern.test(id) || id === '0' || !name || name.length > 200) {
          throw new Error('RankedIn returned an invalid player in ' + division + '.');
        }
        const key = JSON.stringify([id, division]);
        if (entries.has(key) && entries.get(key).name !== name) {
          throw new Error('RankedIn returned conflicting names for a player in ' + division + '.');
        }
        entries.set(key, { id, name, division });
        if (entries.size > maxRows) throw new Error('This roster is too large to review in one import.');
      }
    }
  }
  return [...entries.values()].sort((a, b) => order(a.division, b.division) || order(a.id, b.id));
}

export async function reviewRankedinParticipantSync({ client, event, expectedUserId, scopeId, signal, gateway = createCalendarRankedinGateway() }) {
  const rankedinId = importedRankedinId(event);
  if (!rankedinId || event.is_manual === true) throw new Error('Select a saved event linked to a RankedIn tournament.');
  await verifyImportedParticipantWrite({ client, eventId: event.id, expectedUserId, scopeId, signal });
  const entries = await loadRankedinParticipantSnapshot(gateway, rankedinId, signal);
  await verifyImportedParticipantWrite({ client, eventId: event.id, expectedUserId, scopeId, signal });
  let query = client.rpc(operation, { p_event_id: event.id, p_rankedin_id: rankedinId, p_entries: entries });
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw error;
  if (String(data?.event_id) !== String(event.id) || !reviewedTokenPattern.test(data.token) || !Array.isArray(data.changes)) {
    throw new Error('The roster review could not be confirmed.');
  }
  return { eventId: event.id, rankedinId, entries, plan: data, reviewedAt: Date.now() };
}

export async function saveRankedinParticipantSync({ client, event, preview, expectedUserId, scopeId, isCurrent, onAttempt }) {
  if (!isCurrent() || Date.now() - preview.reviewedAt > reviewLifeMs || String(preview.eventId) !== String(event.id)
    || preview.rankedinId !== importedRankedinId(event)) {
    throw new Error('The roster review expired or the selected event changed. Open a fresh review.');
  }
  await verifyImportedParticipantWrite({ client, eventId: event.id, expectedUserId, scopeId });
  if (!isCurrent()) throw new Error('The selected event changed. Open a fresh review.');
  onAttempt();
  const { data, error } = await client.rpc(operation, {
    p_event_id: event.id, p_rankedin_id: preview.rankedinId, p_entries: preview.entries, p_expected: preview.plan.token,
  });
  if (error) throw error;
  if (String(data?.event_id) !== String(event.id) || data.status !== 'saved') {
    throw new Error('The imported roster outcome could not be confirmed.');
  }
  return data;
}
