import { supabase } from '../../supabaseClient';
import { logEventActivity } from '../../utils/eventActivityLog';
import { saveManualEntryPayment, unmarkManualEntryPayment } from '../../utils/manualEntryPayment';
import { findAdminMarkedPayment, registrationCountsAsPaid, resolveRegistrationPayer } from '../../utils/paymentRegistrationMatch';
import { readAll } from './playersData';

export async function saveEventPayment({ event, registration, type, method, note }) {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth?.user?.email) throw new Error('Sign in again before changing a payment.');
  const { data: permission, error: permissionError } = await supabase.from('admin_sidebar_permissions').select('role').eq('email', auth.user.email).maybeSingle();
  if (permissionError || permission?.role !== 'super_admin') throw new Error('A verified super-admin account is required.');
  const { data: reg, error } = await supabase.from('event_registrations').select('*').eq('id', registration.id).eq('event_id', event.id).single();
  if (error || !reg) throw new Error('Registration is no longer available.');
  if (String(reg.status).toLowerCase() === 'withdrawn') throw new Error('This registration has been withdrawn.');
  const [payments, refunds] = await Promise.all([
    readAll(() => supabase.from('payments').select('*').eq('event_id', event.id).order('id')),
    readAll(() => supabase.from('payment_refunds').select('*').eq('event_registration_id', reg.id).order('id')),
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
    if (!note?.trim()) throw new Error('Enter a reason or payment note.');
    if (method !== 'comp') {
      const { data: division, error: divisionError } = await supabase.from('tournament_divisions').select('entry_fee').eq('event_id', event.id).eq('name', reg.division).single();
      if (divisionError || division?.entry_fee == null) throw new Error('Unable to verify the division fee.');
      fee = Number(division.entry_fee);
    }
  }
  try {
    const args = { supabase, event, reg, payments, method, note: note?.trim(), fee, logEventActivity };
    if (type === 'unmark') await unmarkManualEntryPayment(args);
    else await saveManualEntryPayment(args);
  } catch (cause) {
    throw new Error(`Save could not be completed. Some changes may have been saved; close and refresh before retrying. ${cause.message || ''}`);
  }
}
