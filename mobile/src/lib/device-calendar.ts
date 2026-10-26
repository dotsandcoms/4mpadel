import { ActionSheetIOS, Alert, Linking, Platform } from 'react-native';

type CalendarEntry = { title: string; startDate: string; endDate?: string | null; location?: string; url?: string };
let presenting = false;
let choosing = false;

const calendarNotes = (entry: CalendarEntry) => `Added from 4M Padel. Tournament dates may change.${entry.url ? `\n${entry.url}` : ''}`;

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

/** Date-only ranges preserve tournament days in every Google Calendar time zone. */
export function googleCalendarUrl(entry: CalendarEntry): string {
  const { startDate, endDate } = calendarRange(entry.startDate, entry.endDate, true);
  const day = (date: Date) => date.toISOString().slice(0, 10).replace(/-/g, '');
  const url = new URL('https://calendar.google.com/calendar/r/eventedit');
  url.searchParams.set('action', 'TEMPLATE');
  url.searchParams.set('text', entry.title);
  url.searchParams.set('dates', `${day(startDate)}/${day(endDate)}`);
  url.searchParams.set('details', calendarNotes(entry));
  if (entry.location) url.searchParams.set('location', entry.location);
  return url.href;
}

function chooseCalendar(): Promise<'device' | 'google' | null> {
  return new Promise(resolve => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({
        title: 'Add to calendar', options: ['Apple Calendar', 'Google Calendar', 'Cancel'], cancelButtonIndex: 2,
      }, index => resolve(index === 0 ? 'device' : index === 1 ? 'google' : null));
    } else {
      Alert.alert('Add to calendar', 'Choose where to add this event.', [
        { text: 'Device calendar', onPress: () => resolve('device') },
        { text: 'Google Calendar', onPress: () => resolve('google') },
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
      ], { cancelable: true, onDismiss: () => resolve(null) });
    }
  });
}

/** Opens the chosen provider's event form; the user reviews and saves the event. */
export async function addToCalendar(entry: CalendarEntry) {
  if (choosing) return;
  choosing = true;
  try {
    const googleUrl = googleCalendarUrl(entry); // Validate before showing a picker.
    const destination = Platform.OS === 'web' ? 'google' : await chooseCalendar();
    if (destination === 'google') {
      try { await Linking.openURL(googleUrl); }
      catch { throw new Error('Google Calendar could not open. Please try again.'); }
    } else if (destination === 'device') {
      return await addToDeviceCalendar(entry);
    }
  } finally { choosing = false; }
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
      notes: calendarNotes(entry),
      ...(Platform.OS === 'ios' && entry.url ? { url: entry.url } : {}),
    });
  } finally { presenting = false; }
}
