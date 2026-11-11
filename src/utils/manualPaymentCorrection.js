import { isCompedEntryPayment, isExplicitAdminMarkedPayment, normalizePaymentMetadata } from './paymentRegistrationMatch';

// Presentation only: the correction RPC independently rechecks scope and linkage.
export function canCorrectManualPayment(payment, registration) {
    if (!payment || !registration?.id || registration.payment_status !== 'paid' || payment.status !== 'success' || payment.payment_type !== 'event_entry_fee'
        || !(Number(payment.amount) > 0) || !isExplicitAdminMarkedPayment(payment) || isCompedEntryPayment(payment)) return false;
    const metadata = normalizePaymentMetadata(payment.metadata);
    if (['manual_event', 'division_switch', 'native_event'].includes(metadata.source)) return false;
    if (registration.event_id != null && String(payment.event_id) !== String(registration.event_id)) return false;
    return String(metadata.registration_id || (payment.reference === `MANUAL-ADMIN-${registration.id}` ? registration.id : '')) === String(registration.id);
}
