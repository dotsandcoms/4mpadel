import type { Division, EventDetail } from './events';

/** Port of website src/utils/eventEntryFee.js. Values are ZAR per player. */
export function isEarlyBirdActive(event: EventDetail, now = new Date()) {
  const fee = event.early_bird_fee;
  return !!event.early_bird_ends_at && new Date(event.early_bird_ends_at).getTime() > now.getTime()
    && fee !== null && fee !== undefined && fee !== '' && Number(fee) >= 0;
}
export function entryFee(event: EventDetail, division?: Division | null, now = new Date()) {
  return Number(isEarlyBirdActive(event, now) ? event.early_bird_fee : division?.entry_fee ?? event.entry_fee ?? 0);
}

export function registrationState(event: EventDetail, division?: Division | null, now = new Date()) {
  if (event.event_status === 'cancelled') return 'cancelled' as const;
  if (event.registration_opens_at && new Date(event.registration_opens_at) > now) return 'not-open' as const;
  if ((event.registration_closes_at && new Date(event.registration_closes_at) < now)
    || (division?.entries_close_at && new Date(division.entries_close_at) < now)) return 'closed' as const;
  const end = event.end_date || event.start_date;
  if (end && end.slice(0, 10) < localDay(now)) return 'finished' as const;
  return 'open' as const;
}
export function localDay(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function formatMoney(value: number) {
  return `R ${value.toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export type EventFilters = { search: string; timing: 'upcoming' | 'past' | 'saved'; city: string; tier: string };
export function filterEvents(events: EventDetail[], filters: EventFilters, savedIds: number[], now = new Date()) {
  const today = localDay(now);
  const needle = filters.search.trim().toLowerCase();
  return events.filter(event => {
    const end = (event.end_date || event.start_date || '').slice(0, 10);
    if (filters.timing === 'saved' && (!savedIds.includes(event.id) || event.event_status === 'cancelled')) return false;
    if (filters.timing === 'past' && (!end || end >= today)) return false;
    if (filters.timing === 'upcoming' && end && end < today) return false;
    if (filters.city && event.city !== filters.city) return false;
    if (filters.tier && event.sapa_status !== filters.tier) return false;
    return !needle || [event.event_name, event.city, event.venue, event.organiser_name, event.sapa_status,
      event.is_league ? 'league' : 'tournament'].some(value => value?.toLowerCase().includes(needle));
  }).sort((a, b) => {
    const order = (a.start_date || '9999').localeCompare(b.start_date || '9999') || a.id - b.id;
    return filters.timing === 'past' ? -order : order;
  });
}

/** Published rich text is rendered as text, never executable HTML in the native app. */
export function plainText(html?: string | null) {
  return (html || '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?\s*>|<\/(?:p|div|li|h[1-6])>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '• ').replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/\n{3,}/g, '\n\n').trim();
}
