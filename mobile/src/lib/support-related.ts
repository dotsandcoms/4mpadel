import type { CalendarEvent } from './home';
import type { SelectOption } from '@/components/select-field';

export type SupportRelatedOption = SelectOption & { entryId?: string; eventId?: number; paymentId?: string; paymentKind?: string; date?: string; location?: string };
export type SupportRelatedKind = 'entry' | 'payment';

export const supportSearchKey = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export const supportItemTitle = (value: string) => value.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '').replace(/\s+/g, ' ').trim();

export function filterSupportOptions(options: SupportRelatedOption[], query: string) {
  const words = supportSearchKey(query).split(' ').filter(Boolean);
  return options.filter(option => {
    const key = supportSearchKey([option.label, option.detail, option.location, option.amount, option.status?.label, option.value].filter(Boolean).join(' '));
    return words.every(word => key.includes(word));
  });
}

function displayDate(value: string) {
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '';
  const date = new Date(`${day}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Johannesburg' });
}

export function entrySupportOptions(events: CalendarEvent[], today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg' }).format(new Date())): SupportRelatedOption[] {
  return [...new Map(events.filter(event => event.isRegistered).map(event => {
    const start = displayDate(event.start_date || ''), end = event.end_date && event.end_date !== event.start_date ? displayDate(event.end_date) : '';
    const name = event.event_name || 'Tournament';
    return [event.id, {
      label: supportItemTitle(name), value: `${name} (event #${event.id})`, eventId: event.id,
      date: event.start_date || undefined,
      detail: start ? `${start}${end ? ` – ${end}` : ''}` : 'Date to be confirmed',
      location: [...new Set([event.venue, event.city].filter(Boolean))].join(' · '),
      group: (event.end_date || event.start_date || '').slice(0, 10) >= today ? 'Current & upcoming' : 'Past entries',
    }];
  })).values()];
}
