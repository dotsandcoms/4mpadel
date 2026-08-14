export const IMMINENT_MS = 24 * 60 * 60 * 1000;
export const LIVE_AFTER_MS = 2 * 60 * 60 * 1000;

export function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function formatClock(date: Date) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/** Date-only ISO strings should not surface as 00:00. */
export function dateHasClock(date: Date, source?: string | null) {
  const raw = source?.trim() ?? '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  return date.getHours() !== 0 || date.getMinutes() !== 0;
}

/** Home dates: Today, 16:00 or Fri, 14 Aug · 16:00. */
export function formatHomeWhen(date: Date, source?: string | null, now = new Date()) {
  if (!date.getTime()) return '';
  const time = dateHasClock(date, source) ? formatClock(date) : null;
  if (sameDay(date, now)) return time ? `Today, ${time}` : 'Today';

  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (sameDay(date, tomorrow)) return time ? `Tomorrow, ${time}` : 'Tomorrow';

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, yesterday)) return time ? `Yesterday, ${time}` : 'Yesterday';

  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(date);
  const day = date.getDate();
  const month = new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(date);
  const when = `${weekday}, ${day} ${month}`;
  return time ? `${when} · ${time}` : when;
}

export function formatHomeRange(start: Date, end?: Date | null) {
  if (!start.getTime()) return '';
  if (!end || sameDay(start, end)) return formatHomeWhen(start);
  const startDay = start.getDate();
  const endDay = end.getDate();
  const startMonth = new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(start);
  const endMonth = new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(end);
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${startDay}–${endDay} ${startMonth}`;
  }
  return `${startDay} ${startMonth} – ${endDay} ${endMonth}`;
}

export function formatStartsIn(ms: number) {
  const totalMins = Math.max(0, Math.round(ms / 60000));
  const days = Math.floor(totalMins / (60 * 24));
  const hours = Math.floor((totalMins % (60 * 24)) / 60);
  const mins = totalMins % 60;
  if (days > 0) return hours > 0 ? `Starts in ${days}d ${hours}h` : `Starts in ${days}d`;
  if (hours > 0) return `Starts in ${hours}h ${mins}m`;
  if (mins > 0) return `Starts in ${mins}m`;
  return 'Starts now';
}

export type MatchTiming =
  | { kind: 'scheduled'; label: string }
  | { kind: 'imminent'; label: string }
  | { kind: 'live'; label: string }
  | { kind: 'past'; label: string }
  | { kind: 'unknown'; label: string };

export function matchTiming(date: Date, source?: string | null, now = Date.now()): MatchTiming {
  const start = date.getTime();
  if (!start) return { kind: 'unknown', label: '' };
  const delta = start - now;
  if (delta > IMMINENT_MS) {
    return { kind: 'scheduled', label: formatHomeWhen(date, source, new Date(now)) };
  }
  if (delta > 0) return { kind: 'imminent', label: formatStartsIn(delta) };
  if (now - start < LIVE_AFTER_MS) return { kind: 'live', label: 'Live now' };
  return { kind: 'past', label: formatHomeWhen(date, source, new Date(now)) };
}
