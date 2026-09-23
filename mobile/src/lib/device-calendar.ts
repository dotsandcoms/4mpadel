import { Platform } from 'react-native';

type CalendarEntry = { title: string; startDate: string; endDate?: string | null; location?: string; url?: string };
let presenting = false;

/** Tournament dates are inclusive; native all-day calendars require an exclusive end. */
export function calendarRange(start: string, end?: string | null, android = Platform.OS === 'android') {
  const parse = (value: string) => {
    const day = value.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Event dates are not available yet.');
    const [y, m, d] = day.split('-').map(Number);
    const date = android ? new Date(Date.UTC(y, m - 1, d)) : new Date(y, m - 1, d);
    if ((android ? date.toISOString().slice(0, 10) : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`) !== day) throw new Error('Event dates are invalid.');
    return date;
  };
  const startDate = parse(start);
  const endDate = parse(end || start);
  if (endDate < startDate) throw new Error('Event dates are invalid.');
  if (android) endDate.setUTCDate(endDate.getUTCDate() + 1);
  else endDate.setDate(endDate.getDate() + 1);
  return { startDate, endDate, allDay: true, ...(android ? { timeZone: 'UTC' } : {}) };
}

export async function addToDeviceCalendar(entry: CalendarEntry) {
  if (presenting) return;
  presenting = true;
  try {
    const dates = calendarRange(entry.startDate, entry.endDate);
    // The supported legacy entry point exposes the permission-free OS event composer.
    const Calendar = await import('expo-calendar/legacy');
    if (Platform.OS === 'ios' && Number.parseInt(String(Platform.Version), 10) < 17) {
      const permission = await Calendar.requestCalendarPermissionsAsync();
      if (!permission.granted) throw new Error('Allow calendar access in Settings to add this event.');
    }
    return await Calendar.createEventInCalendarAsync({
      ...dates, title: entry.title, location: entry.location,
      notes: `Added from 4M Padel. Tournament dates may change.${entry.url ? `\n${entry.url}` : ''}`,
      ...(Platform.OS === 'ios' && entry.url ? { url: entry.url } : {}),
    });
  } finally { presenting = false; }
}
