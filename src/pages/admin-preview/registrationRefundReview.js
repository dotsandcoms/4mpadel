import { verifyCalendarPlatformActor } from './calendarRecordActions.js';
import { verifyEventOperationAccess } from './eventOperationAccess.js';

export function registrationRefundAction(refund) {
  const claim = refund.metadata?.reviewed_retry;
  if (claim?.phase === 'held') return claim.method === 'paystack' ? 'reconcile' : null;
  if (claim?.method === 'paystack' && ['processing', 'needs_attention'].includes(refund.status)) return 'reconcile';
  if (refund.status !== 'failed' || !refund.payment_id) return null;
  if (['cash', 'manual'].includes(refund._paymentMethod)) return refund.paystack_refund_id ? null : 'retry';
  if (refund._paymentMethod !== 'paystack') return null;
  if (refund.paystack_refund_id || (refund.metadata?.verify_failed === true && !refund.metadata.retried_at)) return 'retry';
  return null;
}

export async function saveRegistrationRefundReview({ client, eventId, registration, refund, action, expectedUserId, scopeId, isCurrent, onAttempt }) {
  if (!registration?.id || String(registration.event_id) !== String(eventId) || refund.event_registration_id !== registration.id
      || !action || registrationRefundAction(refund) !== action) throw new Error('Choose a refund for this exact event registration.');
  await verifyCalendarPlatformActor({ client, expectedUserId, scopeId, isCurrent });
  await verifyEventOperationAccess({ client, eventId, expectedUserId, scopeId });
  const { data: fresh, error: readError } = await client.from('payment_refunds')
    .select('id,payment_id,event_registration_id,status,amount,metadata,paystack_refund_id')
    .eq('id', refund.id).eq('event_registration_id', registration.id).maybeSingle();
  if (readError || !isCurrent() || fresh?.id !== refund.id || fresh.payment_id !== refund.payment_id
      || fresh.status !== refund.status || Number(fresh.amount) !== Number(refund.amount)
      || fresh.metadata?.reviewed_retry?.reference !== refund.metadata?.reviewed_retry?.reference
      || registrationRefundAction({ ...fresh, _paymentMethod: refund._paymentMethod }) !== action) {
    throw new Error('The saved refund changed. Review its current status.');
  }
  onAttempt();
  const { data, error } = await client.functions.invoke('paystack-refund', { body: {
    action: action === 'retry' ? 'reviewed_retry_failed' : 'reconcile_retry',
    // Older versions interpret unknown actions with registration_id as withdrawals.
    event_id: eventId, reviewed_registration_id: registration.id, payment_refund_id: refund.id,
  } });
  if (error) {
    let detail;
    try { detail = await error.context?.json(); } catch { /* The transport response can be unavailable. */ }
    throw new Error(detail?.error || 'The refund status could not be confirmed. Refresh the saved record.');
  }
  if (data?.error || !['failed', 'needs_attention', 'processing', 'processed'].includes(data?.status)) {
    throw new Error(data?.error || 'The refund status could not be confirmed. Refresh the saved record.');
  }
  return data;
}
