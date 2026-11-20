import { restrictPreviewEvents } from './access.js';
import { readAll } from './playersData.js';

export const auditPageSize = 40;
const fields = 'id,event_id,created_at,summary,category,action,actor_role';
export const activityFields = includePrivate => includePrivate ? `${fields},actor_email,details` : fields;

export function formatAuditDate(value, includeTime = false) {
  const date = value && new Date(value);
  if (!date || !Number.isFinite(date.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-ZA', { dateStyle:'medium', ...(includeTime && { timeStyle:'short' }),
    timeZone:'Africa/Johannesburg' }).format(date);
}

export async function loadEventActivity(client, eventId, includePrivate) {
  const rows = await readAll(() => client.from('event_activity_log').select(activityFields(includePrivate))
    .eq('event_id', eventId).order('id'));
  return rows.filter(row => String(row.event_id) === String(eventId))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

export async function loadAuditEvents(client, permissions, scope, signal) {
  return readAll(() => restrictPreviewEvents(client.from('calendar').select('id,event_name').order('event_name').order('id'), permissions, scope), signal);
}

export async function loadAuditPage(client, options) {
  const { events, eventId, allowAll, category, search, offset = 0, signal } = options;
  if (!((allowAll && !eventId) || (eventId && events.some(event => String(event.id) === String(eventId))))) {
    throw new Error('Choose an event from this workspace.');
  }
  let query = client.from('event_activity_log').select(activityFields(allowAll), { count: 'exact' });
  if (eventId) query = query.eq('event_id', eventId);
  if (category) query = query.eq('category', category);
  if (search.trim()) {
    const literal = search.trim().slice(0, 120).replace(/[\\%_*]/g, '\\$&');
    query = query.ilike('summary', `%${literal}%`);
  }
  query = query.order('created_at', { ascending: false }).order('id').range(offset, offset + auditPageSize - 1);
  if (signal) query = query.abortSignal(signal);
  const { data, count, error } = await query;
  if (error) throw error;
  return { rows: data || [], count: count || 0 };
}
