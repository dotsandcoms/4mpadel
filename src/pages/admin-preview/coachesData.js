import { readAll } from './playersData.js';

export function canReadCoaches(session, permissions, scopeId) {
  return Boolean(session?.user?.id && scopeId === 'all' && (permissions?.role === 'super_admin' || permissions?.allowed_tabs?.includes('coaches')));
}
export async function loadCoaches(client, session, permissions, scopeId, signal) {
  if (!canReadCoaches(session, permissions, scopeId)) throw new Error('Coaches admin access in All 4M Padel is required.');
  return readAll(() => client.from('coach_applications').select('*').order('created_at', { ascending: false }).order('id'), signal);
}
export function filterCoaches(rows, { query = '', status = '', gender = '' } = {}) {
  const search = query.trim().toLowerCase();
  return rows.filter(row => (!search || [row.full_name, row.email].some(value => String(value || '').toLowerCase().includes(search)))
    && (!status || row.status === status) && (!gender || row.gender === gender));
}
export function coachLink(value) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : null; }
  catch { return null; }
}
