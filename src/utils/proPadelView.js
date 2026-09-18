export const formatNumber = (value) => value == null ? '—' : new Intl.NumberFormat('en-ZA').format(value);
const countries = new Intl.DisplayNames(['en'], { type: 'region' });
export function countryName(code) { try { return code ? countries.of(code.toUpperCase()) : 'Country unavailable'; } catch { return 'Country unavailable'; } }
export function formatDate(value, options = {}) {
  return value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Johannesburg', ...options }).format(new Date(value)) : 'Date to be confirmed';
}
export const levelName = (level) => ({ major: 'MAJOR', p1: 'P1', p2: 'P2', finals: 'FINALS' })[level] || 'TOUR';
export function playerResult(match, id) {
  if (!['finished', 'retired'].includes(match.status) || !match.winner) return null;
  const team = match.teams.findIndex((players) => players.some((p) => p.id === id));
  return team < 0 ? null : match.winner === `team_${team + 1}` ? 'W' : 'L';
}
const escapeCalendar = (text) => String(text || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
export function tournamentCalendar(tournament) {
  const start = new Date(`${tournament.startDate.slice(0, 10)}T00:00:00Z`);
  const end = new Date(`${tournament.endDate.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) throw new Error('Invalid tournament dates');
  end.setUTCDate(end.getUTCDate() + 1);
  const compact = (date) => date.toISOString().slice(0, 10).replace(/-/g, '');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//4M Padel//Pro Tour//EN', 'BEGIN:VEVENT', `UID:pro-${tournament.id}@4mpadel.co.za`, `DTSTAMP:${compact(start)}T000000Z`, `DTSTART;VALUE=DATE:${compact(start)}`, `DTEND;VALUE=DATE:${compact(end)}`, `SUMMARY:${escapeCalendar(tournament.name)}`, `LOCATION:${escapeCalendar(tournament.venue || tournament.location)}`, 'DESCRIPTION:Dates from Padel API. Check the event schedule for changes.', 'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');
}
