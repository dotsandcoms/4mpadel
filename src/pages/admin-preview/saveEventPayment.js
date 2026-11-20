import { supabase } from '../../supabaseClient';
import { logEventActivity } from '../../utils/eventActivityLog';
import { saveManualEntryPayment, unmarkManualEntryPayment } from '../../utils/manualEntryPayment';
import { findAdminMarkedPayment, registrationCountsAsPaid, resolveRegistrationPayer } from '../../utils/paymentRegistrationMatch';
import { normalizePaymentMetadata } from '../../utils/paymentRegistrationMatch';
import { canCorrectManualPayment } from '../../utils/manualPaymentCorrection';
import { verifyCalendarPlatformActor } from './calendarRecordActions.js';
import { verifyEventOperationAccess } from './eventOperationAccess.js';
import { readAll } from './playersData';

export async function saveEventPayment({
  event, registration, type, method, note, recipient, receipt, session, scopeId, isCurrent, client = supabase,
}) {
  const authority = { client, expectedUserId: session?.user?.id, scopeId, isCurrent };
  await verifyCalendarPlatformActor(authority);
  await verifyEventOperationAccess({ ...authority, eventId: event.id });
  if (!['paid', 'comp', 'unmark', 'correct'].includes(type)) throw new Error('Choose a valid payment action.');
  const trimmedNote = note?.trim();
  const collectionRecipient = method === 'paystack' ? '4m' : recipient;
  if (type !== 'unmark') {
    if (!trimmedNote || trimmedNote.length > 2000) throw new Error('Enter a payment note of up to 2,000 characters.');
    if (method !== 'comp' && !['4m', 'organiser'].includes(collectionRecipient)) throw new Error('Choose who received this payment.');
  }
  const { data: reg, error } = await client.from('event_registrations').select('*').eq('id', registration.id).eq('event_id', event.id).single();
  if (error || !reg) throw new Error('Registration is no longer available.');
  if (String(reg.status).toLowerCase() === 'withdrawn') throw new Error('This registration has been withdrawn.');
  if (type === 'correct') {
    const { data: saved, error: receiptError } = await client.from('payments').select('id,event_id,status,payment_type,payment_method,amount,metadata,reference')
      .eq('event_id', event.id).eq('id', receipt?.id).single();
    if (receiptError || !saved || !canCorrectManualPayment(saved, reg)) throw new Error('This manual receipt can no longer be corrected.');
    const current = normalizePaymentMetadata(saved.metadata);
    const expected = normalizePaymentMetadata(receipt.metadata);
    if (saved.payment_method !== receipt.payment_method || Number(saved.amount) !== Number(receipt.amount)
      || current.method_corrected_at !== expected.method_corrected_at
      || current.collection_recipient !== expected.collection_recipient || current.payment_note !== expected.payment_note) {
      throw new Error('The receipt changed. Reopen it before saving.');
    }
    await verifyCalendarPlatformActor(authority);
    const { data, error: correctionError } = await client.rpc('correct_manual_event_payment', {
      p_event: event.id, p_registration: reg.id, p_payment: saved.id,
      p_method: method, p_recipient: collectionRecipient, p_note: trimmedNote,
    });
    if (correctionError || data?.paymentId !== saved.id) throw correctionError || new Error('The receipt update could not be confirmed.');
    return;
  }
  const [payments, refunds] = await Promise.all([
    readAll(() => client.from('payments').select('*').eq('event_id', event.id).order('id')),
    readAll(() => client.from('payment_refunds').select('*').eq('event_registration_id', reg.id).order('id')),
  ]);
  const refundMap = new Map();
  refunds.forEach(row => { const value = refundMap.get(row.event_registration_id) || { amount: 0, statuses: [], rows: [] }; value.amount += Number(row.amount || 0); value.statuses.push(row.status); value.rows.push(row); refundMap.set(row.event_registration_id, value); });
  const paid = registrationCountsAsPaid(reg, refundMap, payments);
  let fee = 0;
  if (type === 'unmark') {
    const payment = findAdminMarkedPayment(payments, reg);
    if (!paid || !payment || resolveRegistrationPayer(payment, reg).isPartnerPaid) throw new Error('Only an eligible admin-marked payment can be reversed.');
  } else {
    if (paid) throw new Error('This player is already paid. Refresh the event before continuing.');
    if (method !== 'comp') {
      let query = client.from('tournament_divisions').select('entry_fee').eq('event_id', event.id);
      query = reg.division_id ? query.eq('id', reg.division_id) : query.eq('name', reg.division);
      const { data: division, error: divisionError } = await query.single();
      if (divisionError || division?.entry_fee == null) throw new Error('Unable to verify the division fee.');
      fee = Number(division.entry_fee);
    }
  }
  await verifyCalendarPlatformActor(authority);
  try {
    const args = { supabase: client, event, reg, payments, method, note: trimmedNote, fee, logEventActivity, recipient: collectionRecipient };
    if (type === 'unmark') await unmarkManualEntryPayment(args);
    else await saveManualEntryPayment(args);
  } catch (cause) {
    throw new Error(`Save could not be completed. Some changes may have been saved; close and refresh before retrying. ${cause.message || ''}`);
  }
}
