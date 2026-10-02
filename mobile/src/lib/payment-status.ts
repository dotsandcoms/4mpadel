/** Display recorded state without treating an unsuccessful attempt as refundable. */
export function paymentStatus(status: string, kind: 'payment' | 'refund', refundedTotal = 0) {
  const key = status.trim().toLowerCase().replace(/[ _-]+/g, ' ');
  if (kind === 'refund') return { label: `Refund · ${status || 'Unknown'}`, color: '#2449D8', background: '#EAF0FF', note: 'This is a refund record, not a new payment.' };
  if (key === 'refunded') return { label: 'Refunded', color: '#2449D8', background: '#EAF0FF', note: 'This payment is already recorded as refunded.' };
  if (['success', 'successful', 'paid', 'completed'].includes(key)) return refundedTotal > 0
    ? { label: 'Partially refunded', color: '#2449D8', background: '#EAF0FF', note: 'Part of this payment has already been refunded. The team can review the remaining amount.' }
    : { label: 'Success', color: '#226047', background: '#EAF5EE', note: 'Payment recorded as successful. Any refund request is subject to the entry terms and payment review.' };
  if (['abandoned', 'failed', 'cancelled', 'canceled'].includes(key)) return {
    label: key === 'canceled' ? 'Cancelled' : key.charAt(0).toUpperCase() + key.slice(1), color: '#9B3C37', background: '#FCEFED',
    note: 'This attempt is not recorded as a successful payment, so there is no confirmed payment to refund. If your bank shows a charge, describe it below so the team can investigate.',
  };
  return { label: status || 'Unknown', color: '#805A1D', background: '#FFF4DD', note: 'Payment has not been confirmed as successful. The team will need to check its status before considering a refund.' };
}
