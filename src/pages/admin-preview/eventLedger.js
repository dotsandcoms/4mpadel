import { normalizePaymentMetadata, paymentMatchesRegistration } from '../../utils/paymentRegistrationMatch.js';

export const sessionIdentity = session => session?.user ? `${session.user.id || ''}:${session.user.email || ''}` : '';
export const incomePayments = payments => payments.filter(payment => String(payment.status).toLowerCase() !== 'abandoned');

export function ledgerRegistrations(item, registrations, payments) {
  const payment = item._kind === 'refund' ? payments.find(row => String(row.id) === String(item.payment_id)) : item;
  const meta = normalizePaymentMetadata(payment?.metadata);
  const directId = item.event_registration_id || item.registration_id || meta.registration_id;
  if (directId) {
    const matched = registrations.filter(row => String(row.id) === String(directId));
    if (matched.length) return matched;
  }
  if (!payment) return [];
  return registrations.filter(row => paymentMatchesRegistration(payment, row));
}
