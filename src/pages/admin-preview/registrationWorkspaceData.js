import { scopeCalendarQuery } from '../../utils/adminCalendarScope.js';
import { buildPlayersByEmailMap } from '../../utils/playerLookup.js';
import { resolveRegistrationDivision } from '../../utils/registrationDivision.js';
import { findPaymentForRegistration, hasBlockingProcessedRefund, isPaystackPaymentMethod, normalizePaymentMetadata, registrationIsCompedEntry, resolveRegistrationPaymentMethod } from '../../utils/paymentRegistrationMatch.js';
import { verifyCalendarPlatformActor } from './calendarRecordActions.js';
import { verifyEventOperationAccess } from './eventOperationAccess.js';
import { readEventProfiles } from './eventSnapshots.js';
import { eventLicenseCategory, hydrateEventLicenses } from './eventLicenseData.js';
import { readAll } from './playersData.js';

const emailKey = value => String(value || '').trim().toLowerCase();
const sameId = (left, right) => left != null && right != null && String(left) === String(right);

export const registrationName = row => row.full_name || row.name || row.player_name || row.email?.split('@')[0] || 'Unnamed player';
export const registrationDivisionLabel = (row, divisions) => resolveRegistrationDivision(row, divisions)?.name || row.division || row.division_name || row.category || 'Open division';
export const registrationIsWithdrawn = row => String(row.status).toLowerCase() === 'withdrawn';

export function registrationPaymentState(row, payment, refunds = []) {
  const status = String(row.payment_status || '').toLowerCase();
  const refundMap = new Map([[row.id, { statuses: refunds.map(refund => refund.status), rows: refunds }]]);
  if (status === 'refunded' || hasBlockingProcessedRefund(row, refundMap, payment ? [payment] : [])) return 'refunded';
  if (registrationIsCompedEntry(row, payment ? [payment] : [])) return 'comped';
  if (['paid', 'success', 'successful', 'complete'].includes(status)) {
    const method = resolveRegistrationPaymentMethod(row, payment);
    return method && !isPaystackPaymentMethod(method) ? 'manual' : 'paid';
  }
  if (['failed', 'declined', 'abandoned'].includes(status)) return 'failed';
  return 'pending';
}

export function filterRegistrationWorkspace(rows, { query, quick, payment, licence, division, sort }, divisions, ledger) {
  const needle = String(query || '').trim().toLowerCase();
  const displayDivision = row => registrationDivisionLabel(row, divisions);
  const byName = (a, b) => registrationName(a).localeCompare(registrationName(b));
  return rows.filter(row => {
    const state = registrationPaymentState(row, ledger.payments.get(String(row.id)), ledger.refunds.get(String(row.id)));
    const withdrawn = registrationIsWithdrawn(row);
    if (needle && ![registrationName(row), row.email, row.partner_name, row.partner_email, displayDivision(row), row.id].some(value => String(value || '').toLowerCase().includes(needle))) return false;
    if (quick === 'Needs review' && !String(row.status).includes('review')) return false;
    if (quick === 'Payment issues' && (withdrawn || !['failed', 'pending'].includes(state))) return false;
    if (quick === 'Paid' && (withdrawn || !['paid', 'manual'].includes(state))) return false;
    if (payment === 'withdrawn' ? !withdrawn : payment && payment !== state && !(payment === 'paid' && state === 'manual')) return false;
    return (!licence || (row._licenseCategory || 'unknown') === licence) && (!division || displayDivision(row) === division);
  }).sort((a, b) => {
    if (sort === 'recent') return String(b.created_at || '').localeCompare(String(a.created_at || '')) || byName(a, b);
    if (sort === 'name') return byName(a, b);
    return displayDivision(a).localeCompare(displayDivision(b)) || byName(a, b);
  });
}

export function indexRegistrationLedger(rows, payments, refunds) {
  const paymentByRow = new Map(rows.map(row => [String(row.id), findPaymentForRegistration(payments, row)]));
  const refundByRow = new Map();
  for (const refund of refunds) {
    const key = String(refund.event_registration_id);
    if (!paymentByRow.has(key)) continue;
    if (!refundByRow.has(key)) refundByRow.set(key, []);
    refundByRow.get(key).push(refund);
  }
  return { payments: paymentByRow, refunds: refundByRow };
}

export function recordedRegistrationPayment(row, payment) {
  const metadata = normalizePaymentMetadata(payment?.metadata);
  return {
    method: resolveRegistrationPaymentMethod(row, payment),
    reference: payment?.reference || row.payment_reference,
    note: metadata.payment_note || metadata.note,
    recipient: metadata.collection_recipient_name || metadata.collected_by_name || metadata.collected_by_email || metadata.payment_recipient_name
      || metadata.payment_recipient_email || metadata.recipient_label || metadata.collection_label,
  };
}

export async function loadRegistrationWorkspace({ client, eventId, expectedUserId, scopeId, canReadLedger, signal }) {
  if (!expectedUserId || !Number.isSafeInteger(Number(eventId)) || Number(eventId) <= 0
    || (scopeId !== 'all' && !/^(org|club):[^:]+$/.test(scopeId))) throw new Error('Choose an authorised event workspace.');
  const current = () => !signal?.aborted;
  const { data: auth, error: authError } = await client.auth.getUser();
  if (!current() || authError || auth?.user?.id !== expectedUserId) throw new Error('The signed-in account changed. Reopen this event.');
  const eventRequest = scopeCalendarQuery(client.from('calendar').select('id,is_manual,event_status,organisation_id,club_id').eq('id', eventId), scopeId);
  const { data: event, error } = await (signal ? eventRequest.abortSignal(signal) : eventRequest).single();
  const [kind, scopeKey] = scopeId.split(':');
  if (!current() || error || !sameId(event?.id, eventId) || (kind === 'org' && !sameId(event.organisation_id, scopeKey))
    || (kind === 'club' && !sameId(event.club_id, scopeKey))) throw new Error('This event is outside the selected workspace.');
  if (!event.is_manual) return { event, rows: [], divisions: [], ledger: indexRegistrationLedger([], [], []), canOperate: false };

  const managesEvent = await verifyEventOperationAccess({ client, eventId, expectedUserId, scopeId, signal }).then(() => true, () => false);
  const platform = scopeId === 'all' && canReadLedger
    && await verifyCalendarPlatformActor({ client, expectedUserId, scopeId, isCurrent: current }).then(() => true, () => false);
  if (!current()) throw new DOMException('Cancelled', 'AbortError');
  const [records, divisions, payments] = await Promise.all([
    readAll(() => client.from('event_registrations').select('*').eq('event_id', eventId).order('id'), signal),
    readAll(() => client.from('tournament_divisions').select('id,event_id,name,entry_fee').eq('event_id', eventId).order('id'), signal),
    platform ? readAll(() => client.from('payments').select('*').eq('event_id', eventId).order('id'), signal) : [],
  ]);
  const rowsInEvent = records.filter(row => sameId(row.event_id, eventId));
  const paymentsInEvent = payments.filter(row => sameId(row.event_id, eventId));
  const emails = new Set(rowsInEvent.map(row => emailKey(row.email)).filter(Boolean));
  const profiles = await readEventProfiles(client, [...emails], signal);
  const exactProfiles = profiles.filter(profile => emails.has(emailKey(profile.email)));
  const eligible = await hydrateEventLicenses(client, exactProfiles, eventId, signal).catch(error => {
    if (!current()) throw error;
    return exactProfiles;
  });
  const profileMap = buildPlayersByEmailMap(eligible);
  const rows = rowsInEvent.map(row => {
    const profile = profileMap.get(emailKey(row.email)) || null;
    return { ...row, _player: profile, _licenseCategory: eventLicenseCategory(profile, eventId) };
  });
  const refunds = [];
  if (platform) {
    const paymentIds = new Set(paymentsInEvent.map(row => String(row.id)));
    for (let offset = 0; offset < rows.length; offset += 50) {
      const ids = rows.slice(offset, offset + 50).map(row => row.id);
      const idSet = new Set(ids.map(String));
      const batch = await readAll(() => client.from('payment_refunds').select('id,event_registration_id,payment_id,amount,status,reason,created_at,metadata').in('event_registration_id', ids).order('id'), signal);
      refunds.push(...batch.filter(refund => idSet.has(String(refund.event_registration_id)) && (!refund.payment_id || paymentIds.has(String(refund.payment_id)))));
    }
  }
  return { event, rows, divisions: divisions.filter(row => sameId(row.event_id, eventId)), ledger: indexRegistrationLedger(rows, paymentsInEvent, refunds), canOperate: managesEvent && event.event_status !== 'cancelled' };
}

export async function saveRegistrationWhatsApp({ client, eventId, registration, expectedUserId, scopeId, isCurrent, onAttempt }) {
  if (!registration?.id || !sameId(registration.event_id, eventId) || registrationIsWithdrawn(registration)) throw new Error('Choose an active registration in this event.');
  const access = await verifyEventOperationAccess({ client, eventId, expectedUserId, scopeId });
  if (!isCurrent() || !access.event.is_manual || access.event.event_status === 'cancelled') throw new Error('This event is unavailable for registration updates.');
  const expected = registration.whatsapp_added ?? null;
  const { data: current, error } = await client.from('event_registrations').select('id,event_id,status,whatsapp_added')
    .eq('event_id', eventId).eq('id', registration.id).maybeSingle();
  if (error || !isCurrent() || !sameId(current?.id, registration.id) || !sameId(current.event_id, eventId)
    || registrationIsWithdrawn(current) || (current.whatsapp_added ?? null) !== expected) throw new Error('The registration changed. Reload before updating the group record.');
  const next = !current.whatsapp_added;
  const update = client.from('event_registrations').update({ whatsapp_added: next })
    .eq('event_id', eventId).eq('id', registration.id).eq('status', current.status);
  onAttempt();
  const { data, error: updateError } = await (expected == null ? update.is('whatsapp_added', null) : update.eq('whatsapp_added', expected))
    .select('id,event_id,whatsapp_added').maybeSingle();
  if (updateError) throw updateError;
  if (!sameId(data?.id, registration.id) || !sameId(data.event_id, eventId) || data.whatsapp_added !== next) throw new Error('Could not verify the saved group record.');
  return data;
}
