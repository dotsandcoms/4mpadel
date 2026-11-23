import { isLinkedWeeklyEvent, weeklyUnlinkedOrganiser } from '../../utils/calendarWeeklySeries.js';
import { verifyCalendarPlatformActor } from './calendarRecordActions.js';

const matchesSeries = (data, event) => String(data?.source_id) === String(event.id) && data?.series_id === event.series_id;

export function canReviewCalendarWeeklySeries(event, canManageRecords) {
  return canManageRecords && event?.is_manual === true && isLinkedWeeklyEvent(event);
}

export async function loadCalendarWeeklySeries({ client, event, expectedUserId, scopeId, isCurrent }) {
  if (!canReviewCalendarWeeklySeries(event, true)) throw new Error('Choose a saved weekly 4M event.');
  await verifyCalendarPlatformActor({ client, expectedUserId, scopeId, isCurrent });
  const { data, error } = await client.rpc('admin_calendar_weekly_series_visibility', { p_event_id: Number(event.id) });
  if (error) throw error;
  const { occurrences } = data || {};
  if (!matchesSeries(data, event) || !Array.isArray(occurrences) || !occurrences.some(row =>
    String(row.id) === String(event.id) && row.event_name === event.event_name
      && (row.organisation_id ?? null) === (event.organisation_id ?? null)
      && (row.club_id ?? null) === (event.club_id ?? null)
      && row.unlinked_organiser === weeklyUnlinkedOrganiser(event)
  ) || !isCurrent()) throw new Error('The weekly series changed. Reopen it before continuing.');
  return data;
}

export async function saveCalendarWeeklyVisibility({ client, event, review, visible, expectedUserId, scopeId, isCurrent, onAttempt }) {
  if (!canReviewCalendarWeeklySeries(event, true) || !matchesSeries(review, event) || !review.occurrences?.length || typeof visible !== 'boolean') {
    throw new Error('Review the weekly series and choose its visibility.');
  }
  await verifyCalendarPlatformActor({ client, expectedUserId, scopeId, isCurrent });
  onAttempt();
  const { data, error } = await client.rpc('admin_calendar_weekly_series_visibility', {
    p_event_id: Number(event.id), p_expected: review.occurrences, p_visible: visible,
  });
  if (error) throw error;
  if (!matchesSeries(data, event) || data.updated_count !== review.occurrences.length || data.is_visible !== visible || !isCurrent()) {
    throw new Error('Could not verify the saved visibility for every reviewed week.');
  }
  return data;
}
