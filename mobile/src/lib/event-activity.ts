import { supabase } from './supabase';
import { parseFeedPage, type FeedCursor, type FeedPage } from './following-feed';

export const EVENT_ACTIVITY_FILTERS = ['all', 'entries', 'matches', 'updates'] as const;
export type EventActivityFilter = typeof EVENT_ACTIVITY_FILTERS[number];
export async function fetchEventActivity(eventId: number, filter: EventActivityFilter = 'all', cursor: FeedCursor | null = null): Promise<FeedPage> {
  if (!Number.isSafeInteger(eventId) || eventId <= 0) throw new Error('This event is unavailable.');
  const { data, error } = await supabase.rpc('get_event_activity', {
    p_event_id: eventId, p_filter: filter, p_limit: 20,
    p_before: cursor?.at ?? null, p_before_id: cursor?.id ?? null,
  });
  if (error) throw new Error('Tournament activity could not load. Please retry.');
  return parseFeedPage(data);
}
