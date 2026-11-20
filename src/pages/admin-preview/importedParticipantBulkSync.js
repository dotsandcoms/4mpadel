import { verifyCalendarPlatformActor } from './calendarRecordActions.js';
import { importedRankedinId, reviewRankedinParticipantSync, saveRankedinParticipantSync } from './importedParticipantSync.js';

const cancelled = event => ['cancelled', 'canceled', 'withdrawn'].includes(String(event.event_status || '').toLowerCase()) || Boolean(event.cancelled_at);
const validId = id => Number.isSafeInteger(Number(id)) && Number(id) > 0;
const changeActions = ['add', 'update', 'remove'];

export function bulkImportedRosterEvents(events) {
  const byId = new Map();
  for (const event of events) {
    const source = importedRankedinId(event);
    if (validId(event.id) && event.is_manual !== true && !cancelled(event) && /^[1-9]\d*$/.test(source || '')) {
      byId.set(String(event.id), event);
    }
  }
  return [...byId.values()];
}

export function importedRosterChangeCounts(review) {
  const counts = { add: 0, update: 0, remove: 0, retain: 0 };
  for (const row of review?.plan.changes || []) {
    if (Object.hasOwn(counts, row.action)) counts[row.action]++;
  }
  return counts;
}

export const hasImportedRosterChanges = review => review?.plan.changes.some(row => changeActions.includes(row.action)) === true;

async function currentImportedEvent(client, event, signal) {
  let request = client.from('calendar').select('id,event_name,is_manual,event_status,cancelled_at,rankedin_id,rankedin_url').eq('id', event.id);
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request.single();
  signal?.throwIfAborted();
  if (error || !data || String(data.id) !== String(event.id) || data.is_manual === true || cancelled(data)
    || importedRankedinId(data) !== importedRankedinId(event)) throw new Error('The event or its RankedIn link changed. Refresh the event list.');
  return data;
}

export async function reviewImportedRosterBatch({ client, events, expectedUserId, scopeId, signal, gateway, onProgress = () => {} }) {
  const isCurrent = () => !signal?.aborted;
  await verifyCalendarPlatformActor({ client, expectedUserId, scopeId, isCurrent });
  const candidates = bulkImportedRosterEvents(events);
  const reviewed = [];
  for (const event of candidates) {
    signal?.throwIfAborted();
    try {
      const current = await currentImportedEvent(client, event, signal);
      const review = await reviewRankedinParticipantSync({ client, event: current, expectedUserId, scopeId, signal, gateway });
      reviewed.push({ event: current, review });
    } catch (error) {
      signal?.throwIfAborted();
      reviewed.push({ event, error: error.message || 'The complete roster could not be read.' });
    }
    onProgress(reviewed.length, candidates.length);
  }
  return reviewed;
}

export async function applyImportedRosterBatch({ client, batch, expectedUserId, scopeId, signal, isCurrent, onAttempt, onProgress = () => {} }) {
  await verifyCalendarPlatformActor({ client, expectedUserId, scopeId, isCurrent });
  const saved = [];
  const failures = [];
  for (const { event, review } of batch) {
    if (!isCurrent()) throw new Error('The event workspace changed during the import.');
    if (!hasImportedRosterChanges(review)) continue;
    let attempted = false;
    try {
      const current = await currentImportedEvent(client, event, signal);
      const result = await saveRankedinParticipantSync({ client, event: current, preview: review, expectedUserId, scopeId,
        isCurrent, onAttempt: () => { attempted = true; onAttempt(); } });
      saved.push({ event: current, result });
    } catch (error) {
      if (!isCurrent()) throw error;
      failures.push({ event, attempted, error: error.message || 'The saved outcome could not be confirmed.' });
    }
    onProgress(saved.length + failures.length, batch.length);
  }
  return { saved, failures };
}
