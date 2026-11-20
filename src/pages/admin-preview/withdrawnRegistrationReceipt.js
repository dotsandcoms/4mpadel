import { canCorrectManualPayment } from '../../utils/manualPaymentCorrection.js';
import { normalizePaymentMetadata } from '../../utils/paymentRegistrationMatch.js';
import { verifyCalendarPlatformActor } from './calendarRecordActions.js';
import { verifyEventOperationAccess } from './eventOperationAccess.js';

const methods = ['manual', 'cash', 'eft', 'external'];

export function canCorrectWithdrawnReceipt(registration, receipt, refunds = []) {
  return Boolean(registration?.status === 'withdrawn' && !registration.refunded_at && !(Number(registration.refund_amount) > 0)
    && receipt?.id && methods.includes(receipt.payment_method) && canCorrectManualPayment(receipt, registration)
    && !refunds.some(refund => refund.status !== 'failed'));
}

export function findWithdrawnRegistrationReceipt(registration, payments, refunds) {
  const receipts = payments.filter(payment => canCorrectWithdrawnReceipt(registration, payment, refunds));
  return receipts.length === 1 ? receipts[0] : null;
}

// EventPaymentDialog calls this only for a withdrawn receipt. The RPC compares
// the displayed fields against the locked registration and receipt.
export async function saveWithdrawnRegistrationReceipt({
  client, event, registration, receipt, session, scopeId, type, method, recipient, note, isCurrent,
}) {
  if (type !== 'correct' || !canCorrectWithdrawnReceipt(registration, receipt)
    || String(registration.event_id) !== String(event.id) || String(receipt.event_id) !== String(event.id)) {
    throw new Error('Choose the manual receipt linked to this withdrawn registration.');
  }
  const paymentNote = String(note ?? '').trim();
  if (!methods.includes(method) || !['4m', 'organiser'].includes(recipient) || !paymentNote || paymentNote.length > 2000) {
    throw new Error('Choose the manual method and recipient, and enter a payment note.');
  }
  const authority = { client, expectedUserId: session?.user?.id, scopeId, isCurrent };
  await verifyCalendarPlatformActor(authority);
  const { event: current } = await verifyEventOperationAccess({ ...authority, eventId: event.id });
  if (current.is_manual !== true || !isCurrent()) throw new Error('The workspace changed. Reopen this receipt.');
  const { data, error } = await client.rpc('admin_correct_withdrawn_registration_receipt', {
    p_event: Number(event.id), p_registration: registration.id, p_payment: receipt.id,
    p_method: method, p_recipient: recipient, p_note: paymentNote,
    p_expected: {
      full_name: registration.full_name, email: registration.email, entry_method: registration.payment_method ?? null,
      amount: Number(receipt.amount), method: receipt.payment_method, reference: receipt.reference ?? null,
      metadata: normalizePaymentMetadata(receipt.metadata),
    },
  });
  if (['PGRST202','42883'].includes(error?.code)) throw new Error('Withdrawn receipt corrections are temporarily unavailable.');
  if (error) throw error;
  if (String(data?.paymentId) !== String(receipt.id) || data.method !== method || data.recipient !== recipient) {
    throw new Error('The receipt correction could not be confirmed.');
  }
  return data;
}
