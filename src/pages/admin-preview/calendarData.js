import { readAll } from './playersData.js';

// Deliberately independent of CalendarManager: that module promotes results on load.
// Only SELECTs belong here. No sync, promotion, RPC, storage upload or database writes.
export async function loadCalendar(client, signal) {
  const events = await readAll(() => client.from('calendar').select('*').order('id'), signal);
  const warnings = [];
  const optional = async (table, fields, order = 'id') => {
    try { return await readAll(() => client.from(table).select(fields).order(order), signal); }
    catch (error) { if (signal?.aborted) throw error; warnings.push(`${table.replaceAll('_', ' ')} could not be read. Related information is unavailable.`); return []; }
  };
  const [organisations, audit] = await Promise.all([
    optional('organisations', 'id,name,logo_url'),
    optional('event_creation_audit', 'event_id,creator_name,creator_email,created_at', 'event_id'),
  ]);
  return { events: events.map(e => ({ ...e, _organisation: organisations.find(o => String(o.id) === String(e.organisation_id)), _audit: audit.find(a => String(a.event_id) === String(e.id)) })), warnings };
}

export async function loadCalendarDivisions(client, eventId, signal) {
  return readAll(() => client.from('tournament_divisions').select('*').eq('event_id', eventId).order('sort_order').order('id'), signal);
}

export function dayKey(value) {
  const day = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '';
  const date = new Date(`${day}T12:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day ? '' : day;
}
export function localToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
export function eventPhase(event, today = localToday()) {
  if (event.event_status === 'cancelled') return 'Cancelled';
  const start = dayKey(event.start_date), end = dayKey(event.end_date) || start;
  if (!start || end < start) return 'Unscheduled';
  if (end < today) return 'Past';
  if (start <= today) return 'In progress';
  return 'Upcoming';
}
export function setupGaps(event) {
  const gaps = [];
  if (!dayKey(event.start_date)) gaps.push('Start date missing');
  if (event.end_date && (!dayKey(event.end_date) || event.end_date < event.start_date)) gaps.push('Check end date');
  if (!event.venue) gaps.push('Venue missing');
  if (!event.organisation_id && !event.organiser_name) gaps.push('Organiser missing');
  if (event.allow_payments && (event.entry_fee == null || event.entry_fee === '')) gaps.push('Entry fee not recorded');
  return gaps;
}
export function filterCalendar(events, filters, today = localToday()) {
  const q = (filters.q || '').trim().toLowerCase();
  return events.filter(e => (!q || [e.event_name, e.city, e.venue, e.organiser_name, e._organisation?.name, e.rankedin_id, e.id].some(v => String(v || '').toLowerCase().includes(q)))
    && (!filters.phase || eventPhase(e, today) === filters.phase)
    && (!filters.tier || (e.sapa_status || 'None') === filters.tier)
    && (!filters.visibility || (e.is_visible !== false) === (filters.visibility === 'visible'))
    && (!filters.source || (Boolean(e.rankedin_id) === (filters.source === 'rankedin')))
    && (!filters.flag || (filters.flag === 'gaps' ? setupGaps(e).length > 0 : e[filters.flag] === true)))
    .sort((a, b) => (filters.sort === 'name' ? String(a.event_name || '').localeCompare(String(b.event_name || '')) : (filters.sort === 'oldest' ? 1 : -1) * String(a.start_date || '').localeCompare(String(b.start_date || ''))) || String(a.id).localeCompare(String(b.id)));
}
export function monthDays(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return [];
  const first = new Date(`${month}-01T12:00:00Z`);
  first.setUTCDate(first.getUTCDate() - (first.getUTCDay() + 6) % 7);
  return Array.from({ length: 42 }, (_, i) => { const d = new Date(first); d.setUTCDate(d.getUTCDate() + i); return d.toISOString().slice(0, 10); });
}
export const occursOn = (event, day) => Boolean(dayKey(event.start_date)) && dayKey(event.start_date) <= day && (dayKey(event.end_date) || dayKey(event.start_date)) >= day;
export const tierTone = tier => ({ Major: 'violet', Gold: 'warning', 'Super Gold': 'amber', 'S Gold': 'amber', Silver: 'neutral', Bronze: 'bronze', 'Key Event': 'positive', 'FIP event': 'info' }[tier] || 'neutral');
export const publicEventUrl = event => event.slug ? `/calendar/${encodeURIComponent(event.slug)}` : null;
