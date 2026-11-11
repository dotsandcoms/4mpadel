import type { CalendarEvent, PendingAction, RegistrationState } from './home';
import type { FeedItem, FeedPlayer } from './following-feed';
import type { ProTournament } from './pro-padel';

export function homeEventState(event: CalendarEvent, registrations: Map<number, RegistrationState> | null | undefined, payments: PendingAction[] | undefined): CalendarEvent {
  const state = registrations?.get(event.id);
  const balance = payments?.some(action => action.eventId === event.id && (action.balanceDue ?? 0) > 0);
  return { ...event, ...(state ?? { isRegistered: false, isPaid: false, hasOutstandingPayment: false }),
    registrationKnown: registrations != null,
    ...(balance ? { isPaid: false, hasOutstandingPayment: true, hasEntryBalance: true } : {}) };
}

export function homeFeedSource(item: Pick<FeedItem, 'path'>): '4m' | 'international' {
  return item.path.startsWith('/pro/') ? 'international' : '4m';
}

export function tourSource(event: ProTournament): string {
  if (event.id < 0 || /fip/i.test(`${event.source ?? ''} ${event.level ?? ''} ${event.name}`)) return 'FIP';
  if (/^(major|p1|p2|finals)$/i.test(event.level ?? '') || /premier padel/i.test(event.name)) return 'Premier Padel';
  return 'International';
}

export function tourLevelLabel(level?: string | null): string | null {
  const token = (level ?? '').toLowerCase().replace(/^fip[_ -]?/, '').replaceAll('_', ' ').trim();
  return ({ major: 'Major', p1: 'P1', p2: 'P2', finals: 'Finals', platinum: 'Platinum', gold: 'Gold', silver: 'Silver', bronze: 'Bronze', promises: 'Promises', promotion: 'Promotion' } as Record<string, string>)[token] ?? null;
}

export function homeTourEvents(events: ProTournament[], now = Date.now()): ProTournament[] {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
  return [...new Map(events.filter(event => (event.endDate || event.startDate).slice(0, 10) >= today).map(event => [event.id, event])).values()]
    .sort((a, b) => a.startDate.localeCompare(b.startDate)).slice(0, 6);
}

export const tourPath = (event: ProTournament) => event.id < 0 ? `/pro/fip/${event.id}` : `/pro/tournament/${event.id}`;

export function homeFollowingTeam(actors: FeedPlayer[], participants: FeedPlayer[][], winner: number | null): FeedPlayer[] {
  const team = winner != null ? participants[winner] : undefined;
  return (team?.length ? team : actors.length ? actors : participants[0] ?? []).slice(0, 2);
}

/** Dates without an offset refer to South African event time, never device time. */
function eventTime(value?: string | null): number {
  if (!value) return NaN;
  const text = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00+02:00` : /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value.replace(' ', 'T')}+02:00`;
  return Date.parse(text);
}
export function spotlightCountdown(event: Pick<CalendarEvent, 'registration_opens_at' | 'registration_closes_at' | 'start_date' | 'end_date'>, now: number) {
  const opens = eventTime(event.registration_opens_at), closes = eventTime(event.registration_closes_at), starts = eventTime(event.start_date);
  if (opens > now) return { label: 'Entries open in', target: opens };
  if (closes > now) return { label: 'Entries close in', target: closes };
  if (starts > now) return { label: 'Event starts in', target: starts };
  const ends = eventTime((event.end_date || event.start_date)?.slice(0, 10));
  return { label: Number.isFinite(ends) && now < ends + 86400000 ? 'Event in progress' : Number.isFinite(closes) ? 'Entries closed' : 'View event details', target: null };
}

export function homeOfficialFipEvents(events: ProTournament[], now = Date.now()) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
  return events.filter(event => event.id < 0 && /^(fip[_ -])?(promises|bronze)$/i.test(event.level ?? '') && event.status !== 'finished' && event.endDate.slice(0, 10) >= today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate)).slice(0, 12);
}
