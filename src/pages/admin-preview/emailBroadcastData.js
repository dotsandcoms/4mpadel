import { readAll } from './playersData.js';
import { verifyPublishingAccess } from './publishingAccess.js';

export const canReviewBroadcast = permissions => permissions?.role === 'super_admin' || (Array.isArray(permissions?.allowed_tabs) && permissions.allowed_tabs.includes('email-broadcast'));
export async function verifyBroadcastAccess(client, userId, scopeId, signal) {
  return verifyPublishingAccess(client, scopeId, userId, 'email-broadcast', signal);
}
export const normalizeBroadcastEmail = value => String(value || '').trim().toLowerCase();
const valid = email => /^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/.test(email) && email.length <= 254;
export function parseBroadcastEmails(text) {
  const values = String(text || '').split(/[,\n]/).map(normalizeBroadcastEmail).filter(Boolean);
  return { emails: [...new Set(values.filter(valid))], invalid: [...new Set(values.filter(email => !valid(email)))] };
}
export function broadcastAudience(registrations, participants, payment = 'all', partner = 'all') {
  if (!['all','paid','pending'].includes(payment) || !['all','has_partner','solo'].includes(partner)) throw new Error('Choose valid audience filters.');
  const filtered = registrations.filter(row => {
    if (String(row.status || '').toLowerCase() === 'withdrawn') return false;
    const paid = String(row.payment_status || 'pending').toLowerCase() === 'paid';
    const paired = Boolean(row.partner_name?.trim() || row.partner_email?.trim());
    return (payment === 'all' || (payment === 'paid' ? paid : !paid)) && (partner === 'all' || (partner === 'has_partner' ? paired : !paired));
  });
  return [...new Set([...filtered, ...(payment === 'all' && partner === 'all' ? participants : [])].map(row => normalizeBroadcastEmail(row.email)).filter(valid))];
}
export async function loadBroadcastEvents({ client, userId, scopeId, signal }) {
  await verifyBroadcastAccess(client, userId, scopeId, signal);
  return readAll(() => client.from('calendar').select('id,event_name,start_date').order('start_date', { ascending: true }).order('id'), signal);
}
export async function loadBroadcastAudience({ client, userId, scopeId, eventIds, payment = 'all', partner = 'all', signal }) {
  await verifyBroadcastAccess(client, userId, scopeId, signal);
  // Validate options before any recipient read, even when no events are selected.
  broadcastAudience([], [], payment, partner);
  const ids = [...new Set(eventIds.map(String))];
  const registrations = [], participants = [];
  for (let offset = 0; offset < ids.length; offset += 50) {
    const batch = ids.slice(offset, offset + 50);
    const events = await readAll(() => client.from('calendar').select('id').in('id', batch).order('id'), signal);
    if (events.length !== batch.length || batch.some(id => !events.some(event => String(event.id) === id))) throw new Error('A selected event is unavailable. Reload events before reviewing.');
    registrations.push(...await readAll(() => client.from('event_registrations').select('id,email,payment_status,partner_name,partner_email,status').in('event_id', batch).order('id'), signal));
    if (payment === 'all' && partner === 'all') participants.push(...await readAll(() => client.from('tournament_participants').select('id,email').in('event_id', batch).order('id'), signal));
  }
  return broadcastAudience(registrations, participants, payment, partner);
}
export function combineBroadcastAudience(eventEmails, manualEmails, excluded = []) {
  const removed = new Set(excluded.map(normalizeBroadcastEmail));
  return [...new Set([...eventEmails, ...manualEmails].map(normalizeBroadcastEmail).filter(valid))].filter(email => !removed.has(email));
}
