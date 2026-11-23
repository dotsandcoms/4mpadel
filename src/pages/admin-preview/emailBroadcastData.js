import { readAll } from './playersData.js';
import { verifyPublishingAccess } from './publishingAccess.js';
import { hasTenantMembership } from '../../../supabase/functions/_shared/admin-finance-access.mjs';
import { safeUrl } from '../../utils/sanitizeHtml.js';

export const canReviewBroadcast = permissions => permissions?.role === 'super_admin' || (!hasTenantMembership(permissions)
  && Array.isArray(permissions?.allowed_tabs) && permissions.allowed_tabs.includes('email-broadcast'));
export async function verifyBroadcastAccess(client, userId, scopeId, signal) {
  const grant = await verifyPublishingAccess(client, scopeId, userId, 'email-broadcast', signal);
  let activeRequest = client.rpc('account_is_active');
  if (signal && activeRequest.abortSignal) activeRequest = activeRequest.abortSignal(signal);
  const active = await activeRequest;
  const { data, error } = await client.auth.getUser();
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  if (active.error || active.data !== true || error || data?.user?.id !== userId
    || normalizeBroadcastEmail(data.user.email) !== grant.email) throw new Error('An active account with current Email Broadcast access is required.');
  return grant;
}
export const normalizeBroadcastEmail = value => String(value || '').trim().toLowerCase();
const valid = email => /^[^\s@,<>]+@[^\s@,<>]+\.[^\s@,<>]+$/.test(email) && email.length <= 254;
export function parseBroadcastEmails(text) {
  const values = String(text || '').split(/[,\n]/).map(normalizeBroadcastEmail).filter(Boolean);
  return { emails: [...new Set(values.filter(valid))], invalid: [...new Set(values.filter(email => !valid(email)))] };
}
export function emailBroadcastLink(value) {
  const url = String(value || '').trim();
  if (/^mailto:/i.test(url)) {
    const [email] = url.slice(7).split('?', 1);
    return valid(email) && !/[^\x21-\x7e]|[<>"]|%0[ad]/i.test(url) ? url : null;
  }
  if (/^tel:/i.test(url)) return /^tel:\+?(?=[\d().-]*\d)[\d().-]+(?:;ext=\d+)?$/i.test(url) ? url : null;
  return safeUrl(url);
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
  return readAll(() => client.from('calendar').select('id,event_name,start_date')
    .order('start_date', { ascending: false, nullsFirst: false }).order('id'), signal);
}

async function mayReadBroadcastEvent(client, rpc, args, signal) {
  signal?.throwIfAborted();
  let request = client.rpc(rpc, args);
  if (signal && request.abortSignal) request = request.abortSignal(signal);
  const result = await request;
  signal?.throwIfAborted();
  return !result.error && result.data === true;
}

async function requireCompleteEventAccess(client, grant, ids, registrationsOnly, signal) {
  if (grant.role === 'super_admin' && await mayReadBroadcastEvent(client, 'is_super_admin', { user_email: grant.email }, signal)) return;
  // Finance scopes cover registrations only. Unfiltered broadcasts also need
  // the RankedIn roster, which authorises exact Event Manager access.
  const financeGranted = registrationsOnly && grant.allowed_tabs?.includes('finance');
  const financeIds = financeGranted ? grant.module_permissions?.finance?.allowedEvents : null;
  if (financeGranted && (financeIds === undefined || (Array.isArray(financeIds) && !financeIds.length))) return;
  const exactFinanceIds = new Set(Array.isArray(financeIds) ? financeIds.filter(Number.isSafeInteger).map(String) : []);
  const remaining = ids.filter(id => !exactFinanceIds.has(id));
  for (let offset = 0; offset < remaining.length; offset += 20) {
    const available = await Promise.all(remaining.slice(offset, offset + 20).map(id =>
      mayReadBroadcastEvent(client, 'can_manage_event', { p_event_id: id }, signal)));
    if (available.some(allowed => !allowed)) {
      throw new Error('At least one selected event’s full audience could not be verified. Remove that event or confirm your event access.');
    }
  }
}

export async function loadBroadcastAudience({ client, userId, scopeId, eventIds, payment = 'all', partner = 'all', signal }) {
  const grant = await verifyBroadcastAccess(client, userId, scopeId, signal);
  // Validate options before any recipient read, even when no events are selected.
  broadcastAudience([], [], payment, partner);
  const ids = [...new Set(eventIds.map(String))];
  if (!ids.length) return [];
  if (ids.some(id => !/^[1-9][0-9]*$/.test(id))) throw new Error('Select valid event records before reviewing.');
  const registrationsOnly = payment !== 'all' || partner !== 'all';
  await requireCompleteEventAccess(client, grant, ids, registrationsOnly, signal);
  const registrations = [], participants = [];
  for (let offset = 0; offset < ids.length; offset += 50) {
    const batch = ids.slice(offset, offset + 50);
    const events = await readAll(() => client.from('calendar').select('id').in('id', batch).order('id'), signal);
    if (events.length !== batch.length || batch.some(id => !events.some(event => String(event.id) === id))) throw new Error('A selected event is unavailable. Reload events before reviewing.');
    const eventRegs = await readAll(() => client.from('event_registrations').select('id,event_id,email,payment_status,partner_name,partner_email,status').in('event_id', batch).order('id'), signal);
    const provider = registrationsOnly ? [] : await readAll(() => client.from('tournament_participants').select('id,event_id,email').in('event_id', batch).order('id'), signal);
    if ([...eventRegs, ...provider].some(row => !batch.includes(String(row.event_id)))) throw new Error('The event audience could not be verified. Reload events before reviewing.');
    registrations.push(...eventRegs);
    participants.push(...provider);
  }
  const current = await verifyBroadcastAccess(client, userId, scopeId, signal);
  await requireCompleteEventAccess(client, current, ids, registrationsOnly, signal);
  return broadcastAudience(registrations, participants, payment, partner);
}
export function combineBroadcastAudience(eventEmails, manualEmails, excluded = []) {
  const removed = new Set(excluded.map(normalizeBroadcastEmail));
  return [...new Set([...eventEmails, ...manualEmails].map(normalizeBroadcastEmail).filter(valid))].filter(email => !removed.has(email));
}

export async function emailBroadcastCapability(client, signal) {
  const { data, error } = await client.functions.invoke('send-email', { body: { action: 'broadcast_capability' }, signal });
  if (error || data?.version !== 1 || data.batchSize !== 49) throw new Error('Secure email delivery is unavailable. Check delivery access again before sending.');
  return data;
}

export async function sendReviewedBroadcastBatch(client, { signal, requestId, emails, subject, html }) {
  const { data, error } = await client.functions.invoke('send-email', {
    signal,
    body: { template: 'broadcast', broadcastRequestId: requestId, bcc: emails, variables: { subject, message: html } },
  });
  if (error || data?.success !== true || typeof data.messageId !== 'string' || !data.messageId) {
    throw new Error('The provider did not confirm this batch. Retry the same review to avoid sending it twice.');
  }
}

// Request identifiers and review digests survive navigation. Reconstructing
// the same review asks the provider to confirm every batch with its original key.
export async function broadcastAttemptKey(userId, scopeId, signature, purpose = 'review') {
  try {
    const bytes = new TextEncoder().encode(JSON.stringify([userId, scopeId, signature]));
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return `4m-admin:email-${purpose}:` + Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

export function readBroadcastAttempt(key, batchCount) {
  if (!key) return null;
  try {
    const saved = JSON.parse(globalThis.sessionStorage.getItem(key));
    return Number.isSafeInteger(saved?.startedAt) && saved.startedAt > 0 && saved.startedAt <= Date.now()
      && Array.isArray(saved.batchIds) && saved.batchIds.length === batchCount
      && new Set(saved.batchIds).size === batchCount
      && saved.batchIds.every(id => typeof id === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id))
      ? saved : null;
  } catch {
    return null;
  }
}

export function writeBroadcastAttempt(key, attempt) {
  if (!key) return;
  try {
    if (attempt) globalThis.sessionStorage.setItem(key, JSON.stringify({ batchIds: attempt.batchIds, startedAt: attempt.startedAt }));
    else globalThis.sessionStorage.removeItem(key);
  } catch { /* The current workspace can still retry with its in-memory IDs. */ }
}

export function readInterruptedBroadcast(key) {
  if (!key) return null;
  try {
    const attempt = globalThis.sessionStorage.getItem(key);
    return /^4m-admin:email-review:[a-f0-9]{64}$/.test(attempt ?? '') ? attempt : null;
  } catch {
    return null;
  }
}

export function writeInterruptedBroadcast(key, attempt) {
  if (!key) return;
  try {
    if (attempt) globalThis.sessionStorage.setItem(key, attempt);
    else globalThis.sessionStorage.removeItem(key);
  } catch { /* The current workspace keeps its review state in memory. */ }
}
