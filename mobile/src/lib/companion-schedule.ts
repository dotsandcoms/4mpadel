import type { HomeBundle } from './home';

export type CompanionItem = {
  id: string; kind: 'match' | 'event'; title: string; subtitle: string;
  venue: string; court: string; startAt: number | null; expiresAt: number | null;
  allDay: boolean; status: string; path: string; imageUrl?: string | null;
  registrationOpensAt?: number | null; registrationClosesAt?: number | null;
};
export type CompanionSchedule = { version: 1; updatedAt: number; signedIn: boolean; items: CompanionItem[] };

/** RankedIn/local events in this app are South African schedules, not device-local times. */
export function companionDate(value?: string | null): { time: number | null; allDay: boolean } {
  if (!value) return { time: null, allDay: true };
  const local = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  const iso = local
    ? `${local[3]}-${local[2].padStart(2, '0')}-${local[1].padStart(2, '0')}T${(local[4] || '00').padStart(2, '0')}:${local[5] || '00'}:00+02:00`
    : /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00+02:00`
    : /(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : `${value.replace(' ', 'T')}+02:00`;
  const time = Date.parse(iso);
  return { time: Number.isFinite(time) ? time : null, allDay: !(/\d{1,2}:\d{2}/.test(value)) };
}

function endOfDay(time: number | null) {
  if (time === null) return null;
  // End of calendar day in SAST. Date-only events never imply a match start time.
  return Math.floor((time + 7200000) / 86400000) * 86400000 + 86400000 - 7200000;
}

export function makeCompanionSchedule(bundle: HomeBundle, now = Date.now()): CompanionSchedule {
  const events: CompanionItem[] = bundle.upcomingSchedule.map(e => {
    const date = companionDate(e.start_date);
    const token = String(e.slug || e.id);
    const pending = bundle.pending.some(p => p.kind === 'payment' && p.path.split(/[/?#]/).includes(token));
    return { id: `event-${e.id}`, kind: 'event', title: e.event_name || 'Padel event', subtitle: e.city || '',
      imageUrl: e.custom_image_url || e.poster_image_url || e.image_url || null,
      registrationOpensAt: companionDate(e.registration_opens_at).time,
      registrationClosesAt: companionDate(e.registration_closes_at).time,
      venue: e.venue || '', court: '', startAt: date.time, allDay: date.allDay,
      expiresAt: endOfDay(companionDate(e.end_date || e.start_date).time),
      status: pending ? 'Payment pending' : e.isPaid ? 'Entry paid' : e.isRegistered ? 'Registered' : 'Saved event',
      path: `/events/${encodeURIComponent(token)}` };
  });
  const matches: CompanionItem[] = bundle.upcomingMatches.map(m => {
    const info = m.Info || {};
    const date = companionDate(info.Date);
    const pair = [info.Challenger?.Name, info.Challenger1?.Name].filter(Boolean).join(' / ');
    const opponents = [info.Challenged?.Name, info.Challenged1?.Name].filter(Boolean).join(' / ');
    return { id: `match-${info.EventName}-${info.Date}-${pair}-${opponents}`, kind: 'match', title: info.EventName || 'Upcoming match',
      subtitle: [pair, opponents].filter(Boolean).join(' vs '), venue: info.Venue || info.Location || '', court: info.Court || '',
      startAt: date.time, expiresAt: endOfDay(date.time), allDay: date.allDay,
      status: 'Scheduled match', path: '/profile' };
  });
  const counts = { match: 0, event: 0 };
  const items = [...new Map([...matches, ...events].map(item => [item.id, item])).values()]
    .filter(item => item.expiresAt === null || item.expiresAt > now)
    .sort((a, b) => (a.startAt ?? Infinity) - (b.startAt ?? Infinity) || (a.kind === b.kind ? a.id.localeCompare(b.id) : a.kind === 'match' ? -1 : 1))
    // Reserve room for both Watch categories, even when one has many earlier items.
    .filter(item => ++counts[item.kind] <= 10);
  return { version: 1, updatedAt: now, signedIn: true, items };
}
