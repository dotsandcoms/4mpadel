import { fetchPlayerMatches, type PlayerMatch } from '@/lib/matches';
import { supabase } from '@/lib/supabase';
import { siteUrl } from '@/lib/site';

const CALENDAR_FIELDS =
  'id, event_name, start_date, end_date, city, venue, sapa_status, slug, registered_players, featured_event, is_spotlight, is_manual, featured_live, live_youtube_url, registration_opens_at, registration_closes_at, rankedin_url, organiser_name';

const RANKEDIN_PROFILE =
  'https://api.rankedin.com/v1/player/playerprofileinfoasync';

export type CalendarEvent = {
  id: number;
  event_name: string | null;
  start_date: string | null;
  end_date: string | null;
  city: string | null;
  venue: string | null;
  sapa_status: string | null;
  slug: string | null;
  registered_players: number | null;
  featured_event: boolean | null;
  is_spotlight: boolean | null;
  is_manual: boolean | null;
  featured_live: boolean | null;
  live_youtube_url: string | null;
  registration_opens_at: string | null;
  registration_closes_at: string | null;
  rankedin_url: string | null;
  organiser_name: string | null;
};

export type HomePlayer = {
  id: number;
  name: string | null;
  rank_label: string | null;
  points: number | null;
  region: string | null;
  racket_brand: string | null;
  rankedin_id: string | null;
  category: string | null;
  image_url: string | null;
  license_type: string | null;
  paid_registration: boolean | null;
  winLoss: string | null;
};

export type PendingKind = 'payment' | 'profile';

export type PendingAction = {
  key: string;
  kind: PendingKind;
  title: string;
  subtitle: string;
  detail: string;
  path: string;
};

export type HomeBundle = {
  player: HomePlayer | null;
  happeningNow: CalendarEvent[];
  featured: CalendarEvent[];
  recentResults: CalendarEvent[];
  upcomingSchedule: CalendarEvent[];
  pastSchedule: CalendarEvent[];
  upcomingMatches: PlayerMatch[];
  pastMatches: PlayerMatch[];
  pending: PendingAction[];
};

const EMPTY: HomeBundle = {
  player: null,
  happeningNow: [],
  featured: [],
  recentResults: [],
  upcomingSchedule: [],
  pastSchedule: [],
  upcomingMatches: [],
  pastMatches: [],
  pending: [],
};

const AUTO_RESULT_TIERS = new Set(['gold', 'super gold', 's gold', 'major']);

export async function fetchHomeBundle(email?: string | null): Promise<HomeBundle> {
  const normalised = email?.trim().toLowerCase() ?? '';

  const [player, happeningNow, featured, recentResults, schedule, payments] =
    await Promise.all([
      normalised ? fetchPlayer(normalised) : Promise.resolve(null),
      fetchHappeningNow(),
      fetchFeatured(),
      fetchRecentResults(),
      normalised ? fetchSchedule(normalised) : Promise.resolve({ upcoming: [], past: [] }),
      normalised ? fetchPendingPayments(normalised) : Promise.resolve([] as PendingAction[]),
    ]);

  const pending = [...profileGaps(player), ...payments];

  let winLoss: string | null = null;
  let upcomingMatches: PlayerMatch[] = [];
  let pastMatches: PlayerMatch[] = [];
  if (player?.rankedin_id) {
    const [record, matches] = await Promise.all([
      fetchWinLoss(player.rankedin_id),
      fetchPlayerMatches(player.rankedin_id),
    ]);
    winLoss = record;
    upcomingMatches = matches.upcoming;
    pastMatches = matches.past;
  }

  return {
    player: player ? { ...player, winLoss } : null,
    happeningNow,
    featured,
    recentResults,
    upcomingSchedule: schedule.upcoming,
    pastSchedule: schedule.past,
    upcomingMatches,
    pastMatches,
    pending,
  };
}

export async function fetchPendingActions(email?: string | null): Promise<PendingAction[]> {
  const normalised = email?.trim().toLowerCase() ?? '';
  if (!normalised) return [];
  const [player, payments] = await Promise.all([
    fetchPlayer(normalised),
    fetchPendingPayments(normalised),
  ]);
  return [...profileGaps(player), ...payments];
}

export async function fetchSearchEvents(): Promise<CalendarEvent[]> {
  try {
    const from = new Date();
    from.setDate(from.getDate() - 45);
    const { data, error } = await supabase
      .from('calendar')
      .select(CALENDAR_FIELDS)
      .or('sanction_status.eq.approved,sanction_status.is.null')
      .neq('is_visible', false)
      .gte('start_date', isoDate(from))
      .order('start_date', { ascending: true })
      .limit(120);
    if (error || !data) return [];
    return await enrichManualCounts(data as CalendarEvent[]);
  } catch {
    return [];
  }
}

export function filterSearchEvents(events: CalendarEvent[], query: string): CalendarEvent[] {
  const q = query.trim().toLowerCase();
  if (!q) return events.slice(0, 8);
  return events.filter((event) => {
    const hay = [event.event_name, event.city, event.venue, event.sapa_status]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
}

export function greetingForNow(now = new Date()) {
  const hour = now.getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 18) return 'Good Afternoon';
  return 'Good Evening';
}

export function firstNameOf(name?: string | null) {
  const part = name?.trim().split(/\s+/)[0];
  return part || null;
}

export function eventPath(event: Pick<CalendarEvent, 'id' | 'slug'>) {
  return `/calendar/${event.slug || event.id}`;
}

export function eventWebUrl(event: Pick<CalendarEvent, 'id' | 'slug'>) {
  return siteUrl(eventPath(event));
}

export function eventLocation(event: Pick<CalendarEvent, 'venue' | 'city'>) {
  return [event.venue, event.city].filter(Boolean).join(', ');
}

export function parseDay(iso: string | null | undefined) {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function startOfToday() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

export function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function eventDayParts(iso: string | null) {
  const date = parseDay(iso);
  if (!date) return { day: '–', month: '', weekday: '' };
  return {
    day: String(date.getDate()),
    month: new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(date).toUpperCase(),
    weekday: new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(date).toUpperCase(),
  };
}

export function formatEventRange(startIso: string | null, endIso: string | null) {
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

export function isEventFinished(event: Pick<CalendarEvent, 'start_date' | 'end_date'>, now = new Date()) {
  const end = parseDay(event.end_date || event.start_date);
  if (!end) return false;
  end.setHours(23, 59, 59, 999);
  return end < now;
}

export function isEventLive(event: Pick<CalendarEvent, 'start_date' | 'end_date'>, now = startOfToday()) {
  const start = parseDay(event.start_date);
  if (!start) return false;
  start.setHours(0, 0, 0, 0);
  const end = parseDay(event.end_date || event.start_date) ?? start;
  end.setHours(23, 59, 59, 999);
  return now.getTime() >= start.getTime() && now.getTime() <= end.getTime();
}

async function fetchPlayer(email: string): Promise<Omit<HomePlayer, 'winLoss'> | null> {
  try {
    const { data, error } = await supabase
      .from('players')
      .select(
        'id, name, rank_label, points, region, racket_brand, rankedin_id, category, image_url, license_type, paid_registration'
      )
      .ilike('email', email)
      .maybeSingle();
    if (error || !data) return null;
    return data as Omit<HomePlayer, 'winLoss'>;
  } catch {
    return null;
  }
}

async function fetchWinLoss(rankedinId: string): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(
      `${RANKEDIN_PROFILE}?rankedinId=${encodeURIComponent(rankedinId)}&language=en`,
      { signal: ctrl.signal }
    );
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      Statistics?: { WinLossDoublesCurrentYear?: string };
    };
    return json?.Statistics?.WinLossDoublesCurrentYear ?? null;
  } catch {
    return null;
  }
}

async function fetchHappeningNow(): Promise<CalendarEvent[]> {
  try {
    const today = startOfToday();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    endOfMonth.setHours(23, 59, 59, 999);

    const { data, error } = await supabase
      .from('calendar')
      .select(CALENDAR_FIELDS)
      .neq('is_visible', false)
      .or('sanction_status.eq.approved,sanction_status.is.null')
      .gte('start_date', yesterday.toISOString())
      .lte('start_date', endOfMonth.toISOString())
      .order('start_date', { ascending: true });

    if (error || !data) return [];
    const rows = await enrichManualCounts(data as CalendarEvent[]);
    return rows.filter((event) => isEventLive(event, today)).sort(byFeaturedThenDate);
  } catch {
    return [];
  }
}

async function fetchFeatured(): Promise<CalendarEvent[]> {
  try {
    const today = isoDate(new Date());
    const { data, error } = await supabase
      .from('calendar')
      .select(CALENDAR_FIELDS)
      .or('featured_event.eq.true,is_spotlight.eq.true')
      .or('sanction_status.eq.approved,sanction_status.is.null')
      .gte('start_date', today)
      .neq('is_visible', false)
      .order('start_date', { ascending: true })
      .limit(10);

    if (error || !data) return [];
    const rows = await enrichManualCounts(data as CalendarEvent[]);
    const spotlight = rows.findIndex((event) => event.is_spotlight);
    if (spotlight > 0) {
      const [pin] = rows.splice(spotlight, 1);
      rows.unshift(pin);
    }
    return rows;
  } catch {
    return [];
  }
}

async function fetchRecentResults(): Promise<CalendarEvent[]> {
  try {
    const [{ data: flagged }, { data: autoTiers }] = await Promise.all([
      supabase
        .from('calendar')
        .select(CALENDAR_FIELDS)
        .or('featured_result.eq.true,show_in_recent_results.eq.true')
        .or('sanction_status.eq.approved,sanction_status.is.null')
        .neq('is_visible', false)
        .order('start_date', { ascending: false })
        .limit(10),
      supabase
        .from('calendar')
        .select(CALENDAR_FIELDS)
        .in('sapa_status', ['Gold', 'Super Gold', 'S Gold', 'Major'])
        .or('sanction_status.eq.approved,sanction_status.is.null')
        .neq('is_visible', false)
        .order('start_date', { ascending: false })
        .limit(30),
    ]);

    const byId = new Map<number, CalendarEvent>();
    (flagged as CalendarEvent[] | null)?.forEach((event) => byId.set(event.id, event));
    (autoTiers as CalendarEvent[] | null)
      ?.filter(
        (event) =>
          AUTO_RESULT_TIERS.has((event.sapa_status || '').toLowerCase()) && isEventFinished(event)
      )
      .forEach((event) => {
        if (!byId.has(event.id)) byId.set(event.id, event);
      });

    return [...byId.values()]
      .sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''))
      .slice(0, 10);
  } catch {
    return [];
  }
}

async function fetchSchedule(email: string) {
  try {
    const [{ data: scheduled }, { data: regs }] = await Promise.all([
      supabase
        .from('player_schedule_events')
        .select(`event_id, calendar(${CALENDAR_FIELDS})`)
        .ilike('user_email', email),
      supabase
        .from('event_registrations')
        .select(`event_id, calendar(${CALENDAR_FIELDS})`)
        .or(`email.ilike.${email},partner_email.ilike.${email}`)
        .neq('status', 'withdrawn'),
    ]);

    const byId = new Map<number, CalendarEvent>();
    for (const row of [...(scheduled ?? []), ...(regs ?? [])]) {
      const cal = (row as { calendar?: CalendarEvent | null }).calendar;
      if (cal?.id) byId.set(cal.id, cal);
    }

    const upcoming: CalendarEvent[] = [];
    const past: CalendarEvent[] = [];
    for (const event of byId.values()) {
      if (isEventFinished(event)) past.push(event);
      else upcoming.push(event);
    }
    upcoming.sort((a, b) => (a.start_date || '').localeCompare(b.start_date || ''));
    past.sort((a, b) => (b.start_date || '').localeCompare(a.start_date || ''));
    return { upcoming, past };
  } catch {
    return { upcoming: [] as CalendarEvent[], past: [] as CalendarEvent[] };
  }
}

function filled(value?: string | null) {
  return Boolean(value?.trim());
}

function profileGaps(player: Omit<HomePlayer, 'winLoss'> | null): PendingAction[] {
  if (!player) return [];
  const actions: PendingAction[] = [];
  if (!filled(player.region)) {
    actions.push({
      key: 'profile_region',
      kind: 'profile',
      title: 'Region missing',
      subtitle: 'Select your home region.',
      detail: 'Required to continue',
      path: '/(tabs)/profile',
    });
  }
  if (!filled(player.racket_brand)) {
    actions.push({
      key: 'profile_racket',
      kind: 'profile',
      title: 'Racket brand missing',
      subtitle: 'Select your racket brand.',
      detail: 'Complete your profile',
      path: '/(tabs)/profile',
    });
  }
  return actions;
}

async function fetchPendingPayments(email: string): Promise<PendingAction[]> {
  try {
    const { data, error } = await supabase
      .from('event_registrations')
      .select(
        `id, event_id, email, partner_email, payment_status, partner_payment_status, calendar(id, event_name, slug, start_date)`
      )
      .or(`email.ilike.${email},partner_email.ilike.${email}`)
      .neq('status', 'withdrawn');

    if (error || !data) return [];

    const today = startOfToday();
    const actions: PendingAction[] = [];

    for (const row of data as Array<{
      id: number;
      event_id: number;
      email: string | null;
      partner_email: string | null;
      payment_status: string | null;
      partner_payment_status: string | null;
      calendar: {
        id: number;
        event_name: string | null;
        slug: string | null;
        start_date: string | null;
      } | null;
    }>) {
      const cal = row.calendar;
      const start = parseDay(cal?.start_date);
      if (start && start < today) continue;

      const isRegistrant = row.email?.toLowerCase() === email;
      const status = isRegistrant ? row.payment_status : row.partner_payment_status;
      if (!['pending', 'failed'].includes(String(status || '').toLowerCase())) continue;

      actions.push({
        key: `pay_${row.id}`,
        kind: 'payment',
        title: 'Complete payment',
        subtitle: cal?.event_name || 'Tournament',
        detail: 'Payment outstanding',
        path: `/calendar/${cal?.slug || row.event_id}`,
      });
    }

    return actions;
  } catch {
    return [];
  }
}

async function enrichManualCounts(events: CalendarEvent[]): Promise<CalendarEvent[]> {
  const manualIds = events.filter((event) => event.is_manual).map((event) => event.id);
  if (!manualIds.length) return events;

  const { data: regs } = await supabase
    .from('event_registrations_public')
    .select('event_id, full_name, partner_name')
    .in('event_id', manualIds);

  if (!regs) return events;

  const counts: Record<number, Set<string>> = {};
  for (const reg of regs as Array<{
    event_id: number;
    full_name: string | null;
    partner_name: string | null;
  }>) {
    if (!counts[reg.event_id]) counts[reg.event_id] = new Set();
    if (reg.full_name) counts[reg.event_id].add(reg.full_name.toLowerCase());
    if (reg.partner_name) counts[reg.event_id].add(reg.partner_name.toLowerCase());
  }

  return events.map((event) =>
    event.is_manual
      ? { ...event, registered_players: counts[event.id]?.size ?? 0 }
      : event
  );
}

function byFeaturedThenDate(a: CalendarEvent, b: CalendarEvent) {
  if (a.featured_event && !b.featured_event) return -1;
  if (!a.featured_event && b.featured_event) return 1;
  return (a.start_date || '').localeCompare(b.start_date || '');
}

export { EMPTY as EMPTY_HOME };
