import { useEffect, useState } from 'react';

import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export type OnboardingEventCard = {
  id: string;
  date: string;
  place: string;
  location: string;
  sapaStatus: string | null;
};

const FALLBACK: OnboardingEventCard[] = [
  {
    id: 'fallback-1',
    date: '22–24 AUG',
    place: 'Cape Town Open',
    location: 'Padel X · Cape Town',
    sapaStatus: 'Gold',
  },
  {
    id: 'fallback-2',
    date: '5–7 SEP',
    place: 'Joburg Classic',
    location: 'The Padel Hub · Johannesburg',
    sapaStatus: 'Silver',
  },
];

type CalendarRow = {
  id: number | string;
  event_name: string | null;
  start_date: string | null;
  end_date: string | null;
  city: string | null;
  venue: string | null;
  sapa_status: string | null;
  featured_event: boolean | null;
  is_spotlight: boolean | null;
};

/**
 * Two upcoming events for the first onboarding card.
 *
 * Pinned first: Calendar Manager "Spotlight", then "Feature Event".
 * Remaining slots fill with the next sanctioned, visible events still running
 * or yet to start. Empty or failed fetches keep the static fallback so the
 * screen never looks broken.
 */
export async function fetchOnboardingEvents(): Promise<OnboardingEventCard[]> {
  if (!isSupabaseConfigured()) return FALLBACK;

  try {
    const today = isoDate(new Date());
    const { data, error } = await supabase
      .from('calendar')
      .select(
        'id, event_name, start_date, end_date, city, venue, sapa_status, featured_event, is_spotlight'
      )
      .or('sanction_status.eq.approved,sanction_status.is.null')
      .neq('is_visible', false)
      .or(`end_date.gte.${today},start_date.gte.${today}`)
      .order('start_date', { ascending: true })
      .limit(24);

    if (error || !data?.length) return FALLBACK;

    const upcoming = (data as CalendarRow[]).filter(isUpcoming);
    if (!upcoming.length) return FALLBACK;

    upcoming.sort(byPinThenDate);
    return upcoming.slice(0, 2).map(toCard);
  } catch {
    return FALLBACK;
  }
}

export function useOnboardingEvents() {
  const [events, setEvents] = useState<OnboardingEventCard[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchOnboardingEvents().then((rows) => {
      if (!cancelled) setEvents(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { events, loading: events === null };
}

function isUpcoming(event: CalendarRow) {
  const end = parseDay(event.end_date || event.start_date);
  if (!end) return false;
  end.setHours(23, 59, 59, 999);
  return end >= startOfToday();
}

function byPinThenDate(a: CalendarRow, b: CalendarRow) {
  const pin = pinRank(b) - pinRank(a);
  if (pin !== 0) return pin;
  return (a.start_date || '').localeCompare(b.start_date || '');
}

/** Spotlight outranks Feature Event; both outrank a plain upcoming row. */
function pinRank(event: CalendarRow) {
  if (event.is_spotlight) return 2;
  if (event.featured_event) return 1;
  return 0;
}

function toCard(event: CalendarRow): OnboardingEventCard {
  const location = [event.venue, event.city].filter(Boolean).join(' · ');
  const name = event.event_name?.trim();
  const status = event.sapa_status?.trim();
  return {
    id: String(event.id),
    date: formatRange(event.start_date, event.end_date),
    place: name || location || 'Upcoming event',
    location: name ? location : '',
    sapaStatus: status && status.toLowerCase() !== 'none' ? status : null,
  };
}

function formatRange(startIso: string | null, endIso: string | null) {
  const start = parseDay(startIso);
  if (!start) return '';
  const end = parseDay(endIso);

  const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric' });
  const month = new Intl.DateTimeFormat('en-GB', { month: 'short' });

  if (!end || startIso === endIso) {
    return `${day.format(start)} ${month.format(start)}`.toUpperCase();
  }

  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${day.format(start)}–${day.format(end)} ${month.format(start)}`.toUpperCase();
  }

  return `${day.format(start)} ${month.format(start)} – ${day.format(end)} ${month.format(end)}`.toUpperCase();
}

function parseDay(iso: string | null) {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function startOfToday() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
