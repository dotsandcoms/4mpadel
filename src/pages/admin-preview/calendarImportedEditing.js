import { verifyCalendarPlatformActor } from './calendarRecordActions.js';
import { dayKey } from './calendarData.js';
import { readAll } from './playersData.js';

export const importedCalendarFields = {
  'Event details': [
    ['event_name', 'Event name', 'text'], ['sapa_status', 'Event tier', 'tier'],
    ['tournament_tag', 'Tournament tag', 'tag'], ['points', 'Ranking points', 'number'],
    ['start_date', 'Start date', 'date'], ['end_date', 'End date', 'date'],
    ['start_time', 'Start time', 'time'], ['end_time', 'End time', 'time'],
    ['city', 'City', 'text'], ['venue', 'Venue', 'text'], ['address', 'Address', 'text'],
    ['description', 'Description', 'textarea'],
  ],
  Organiser: [
    ['organisation_id', 'Linked organisation', 'organisation'], ['organiser_name', 'Organiser name', 'text'],
    ['organiser_email', 'Contact email', 'email'], ['organiser_phone', 'Contact phone', 'tel'],
    ['organiser_website', 'Organiser website', 'url'],
  ],
  Publishing: [
    ['is_visible', 'Show on website', 'checkbox'], ['featured_event', 'Feature on homepage', 'checkbox'],
    ['is_spotlight', 'Show in spotlight', 'checkbox'], ['featured_live', 'Feature live coverage', 'checkbox'],
    ['featured_result', 'Show in recent results', 'checkbox'], ['is_league', 'League', 'checkbox'],
    ['live_youtube_url', 'Live stream URL', 'url'], ['youtube_playlist_url', 'YouTube playlist URL', 'url'],
    ['live_players', 'Live players', 'text'], ['next_match', 'Next match', 'text'],
    ['image_url', 'Image URL', 'url'], ['custom_image_url', 'Custom poster URL', 'url'],
  ],
  Finance: [
    ['entry_fee', 'Entry fee (R)', 'number'], ['allow_payments', 'Allow payments', 'checkbox'],
    ['finance_managed', 'Manage in Event Manager', 'checkbox'],
  ],
};

const fields = Object.values(importedCalendarFields).flat();
export const importedCalendarOptions = {
  tier: ['None', 'Bronze', 'Silver', 'Gold', 'Super Gold', 'Major', 'Key Event', 'FIP event'],
  tag: ['None', 'Broll', '360 Padel', 'SA Grand'],
};
const id = value => typeof value === 'number' || typeof value === 'string' && /^\d+$/.test(value)
  ? Number(value) : NaN;

export function importedCalendarDraft(record) {
  return Object.fromEntries(fields.map(([key, , type]) => {
    const raw = record[key];
    if (type === 'checkbox') return [key, key === 'is_visible' ? raw !== false : raw === true];
    return [key, String(raw ?? '')];
  }));
}

export function reviewImportedCalendarChanges(record, draft, organisations) {
  const original = importedCalendarDraft(record);
  const changes = {};
  for (const [key, label, type] of fields) {
    if (draft[key] === original[key]) continue;
    const value = draft[key];
    if (type === 'checkbox') { changes[key] = value; continue; }
    const text = value.trim();
    if (key === 'event_name' && !text) throw new Error('Enter an event name.');
    if (type === 'organisation' && text && !organisations.some(org => org.id === text)) {
      throw new Error('Choose a current approved organisation.');
    }
    if (type === 'date' && text && !dayKey(text)) throw new Error(`${label} is invalid.`);
    if (type === 'url' && text) {
      let url;
      try { url = new URL(text); } catch { /* The validation message below names the field. */ }
      if (!url || !['http:', 'https:'].includes(url.protocol)) throw new Error(`${label} must use HTTP or HTTPS.`);
    }
    if (type === 'number' && text) {
      const number = Number(text);
      if (!Number.isFinite(number) || number < 0 || (key === 'points' && (!Number.isInteger(number) || number > 2147483647))) {
        throw new Error(`Enter a valid ${label.toLowerCase()}.`);
      }
      changes[key] = number;
    } else changes[key] = text || null;
  }
  if (Object.keys(changes).some(key => ['start_date', 'end_date', 'start_time', 'end_time'].includes(key))) {
    const { start_date, end_date, start_time, end_time } = { ...record, ...changes };
    if (end_date && (!start_date || end_date < start_date)) throw new Error('End date must be on or after start date.');
    if (start_date && (!end_date || end_date === start_date) && start_time && end_time
        && end_time.padEnd(8, ':00') < start_time.padEnd(8, ':00')) {
      throw new Error('End time must be on or after start time.');
    }
  }
  return changes;
}

export async function loadImportedCalendarEditor({ client, event, expectedUserId, scopeId, signal }) {
  const eventId = id(event.id);
  if (!Number.isSafeInteger(eventId) || eventId <= 0) throw new Error('Choose a saved calendar event.');
  await verifyCalendarPlatformActor({ client, expectedUserId, scopeId, isCurrent: () => !signal.aborted });
  const { data, error } = await client.rpc('admin_review_imported_calendar_event', { p_event_id: eventId }).abortSignal(signal);
  if (error) throw new Error(error.message);
  if (id(data?.record?.id) !== eventId || data.record.is_manual === true || !/^[a-f0-9]{32}$/.test(data.version)) {
    throw new Error('The imported event could not be verified.');
  }
  const organisations = await readAll(() => client.from('organisations').select('id,name')
    .eq('status', 'approved').order('name').order('id'), signal);
  return { ...data, organisations };
}

export async function saveImportedCalendarChanges({ client, event, expectedUserId, scopeId, source, changes, isCurrent, onAttempt }) {
  const eventId = id(event.id);
  if (!Number.isSafeInteger(eventId) || eventId <= 0 || id(source.record.id) !== eventId
    || !Object.keys(changes).length) throw new Error('Review the selected event and its changes.');
  await verifyCalendarPlatformActor({ client, expectedUserId, scopeId, isCurrent });
  onAttempt();
  const { data, error } = await client.rpc('admin_review_imported_calendar_event', {
    p_event_id: eventId, p_expected: source.version, p_changes: changes,
  });
  if (error) throw new Error(error.message);
  if (id(data?.event_id) !== eventId || !isCurrent()) throw new Error('The saved calendar event could not be confirmed.');
  return { eventId, message: 'Calendar details saved.' };
}
