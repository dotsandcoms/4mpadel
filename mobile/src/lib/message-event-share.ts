import { supabase } from './supabase';
import type { ChatCard } from './messaging';

export type ShareEvent = {
  id: number; event_name: string; start_date: string | null; end_date: string | null;
  venue: string | null; city: string | null; sapa_status: string | null;
  poster_image_url: string | null; custom_image_url: string | null; image_url: string | null;
};
export const SHARE_EVENT_PAGE_SIZE = 25;
const fields = 'id,event_name,start_date,end_date,venue,city,sapa_status,poster_image_url,custom_image_url,image_url';

// Quoted PostgREST values keep punctuation in a search term out of filter syntax.
export function shareEventFilter(query: string, past: boolean, today: string) {
  const term = query.trim().replace(/\s+/g, ' ').slice(0, 80);
  const pattern = `%${term.replace(/[\\%_]/g, '\\$&').replace(/"/g, '\\"')}%`;
  const date = past ? `or(end_date.lt.${today},and(end_date.is.null,start_date.lt.${today}))`
    : `or(end_date.gte.${today},and(end_date.is.null,start_date.gte.${today}))`;
  const search = term ? `,or(event_name.ilike."${pattern}",venue.ilike."${pattern}",city.ilike."${pattern}")` : '';
  return `and(or(sanction_status.is.null,sanction_status.eq.approved),${date}${search})`;
}

export async function findShareEvents(query: string, past: boolean, offset: number, signal: AbortSignal) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg' }).format(new Date());
  const { data, error } = await supabase.from('calendar').select(fields).eq('is_visible', true)
    .or(shareEventFilter(query, past, today)).order('start_date', { ascending: !past }).order('id')
    .range(offset, offset + SHARE_EVENT_PAGE_SIZE - 1).abortSignal(signal);
  if (error) throw new Error('The event calendar could not load. Please try again.');
  return (data ?? []) as ShareEvent[];
}

export function shareEventCard(event: ShareEvent): ChatCard {
  return { eventId: event.id, title: event.event_name, date: event.start_date || '', tab: 'Overview', poster: event.poster_image_url || event.custom_image_url || event.image_url, venue: event.venue, city: event.city, tier: event.sapa_status };
}
export function shareEventDate(value: string | null) {
  if (!value) return 'Date to be confirmed';
  const date = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(date.valueOf()) ? 'Date to be confirmed'
    : date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Johannesburg' });
}
