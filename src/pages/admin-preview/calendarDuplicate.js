import { dayKey } from './calendarData.js';
import { verifyCalendarPlatformActor } from './calendarRecordActions.js';

const action = 'admin_duplicate_calendar_event';
const captured = value => value == null ? '' : String(value);

export function canDuplicateCalendarEvent(event, canManageRecords) {
  return canManageRecords && event?.is_manual === true && Number.isSafeInteger(Number(event.id)) && Number(event.id) > 0;
}

export function prepareCalendarDuplicate(form) {
  const title = String(form.title || '').trim();
  const start = dayKey(form.start);
  const end = dayKey(form.end);
  if (!title) throw new Error('Enter a name for the copied event.');
  if (!start || form.end && (!end || end < start)) throw new Error('Choose valid event dates.');
  return { title, start, end: end || null };
}

export async function loadCalendarDuplicateReview({ client, event, expectedUserId, scopeId, isCurrent }) {
  if (!canDuplicateCalendarEvent(event, true)) throw new Error('Choose a saved 4M-hosted event.');
  await verifyCalendarPlatformActor({ client, expectedUserId, scopeId, isCurrent });
  const { data, error } = await client.rpc(action, { p_source_id: event.id });
  if (error) throw error;
  if (!isCurrent() || String(data?.source_id) !== String(event.id) || data.event_name !== event.event_name
    || captured(data.organisation_id) !== captured(event.organisation_id) || captured(data.club_id) !== captured(event.club_id)
    || !/^[a-f0-9]{32}$/.test(data.fingerprint) || !Number.isSafeInteger(data.division_count)) {
    throw new Error('The selected event changed. Reopen it before copying.');
  }
  return data;
}

export async function saveCalendarDuplicate({ client, event, review, form, requestId, expectedUserId, scopeId, isCurrent, onAttempt }) {
  const copy = prepareCalendarDuplicate(form);
  if (!canDuplicateCalendarEvent(event, true) || String(review?.source_id) !== String(event.id)
    || !/^[a-f0-9]{32}$/.test(review.fingerprint) || !requestId) throw new Error('Review the selected source event again.');
  await verifyCalendarPlatformActor({ client, expectedUserId, scopeId, isCurrent });
  if (!isCurrent()) throw new Error('The workspace changed. Reopen this review.');
  onAttempt();
  const { data, error } = await client.rpc(action, {
    p_source_id: event.id, p_expected_fingerprint: review.fingerprint, p_title: copy.title,
    p_start: copy.start, p_end: copy.end, p_request_id: requestId,
  });
  if (error) throw error;
  if (!Number.isSafeInteger(Number(data?.id)) || Number(data.id) <= 0 || String(data.id) === String(event.id)
    || data.event_name !== copy.title || data.division_count !== review.division_count || typeof data.created !== 'boolean') {
    throw new Error('Could not verify the copied event.');
  }
  return data;
}
