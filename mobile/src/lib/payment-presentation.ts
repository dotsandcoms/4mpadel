export type PaymentPresentation = { label: string; compact: string; confirmed: boolean; tone: 'confirmed' | 'pending' | 'neutral'; due: number | null };
export function paymentPresentation(status?: string | null, balance?: { known: boolean; due: number | null } | null, free = false): PaymentPresentation {
  const value = status?.trim().toLowerCase();
  if (value === 'comped') return { label: 'Complimentary entry', compact: 'Comped', confirmed: true, tone: 'confirmed', due: null };
  const due = balance?.known && balance.due != null && Number.isFinite(balance.due) && balance.due > 0 ? balance.due : null;
  if (due !== null) return { label: 'Balance outstanding', compact: 'Balance due', confirmed: false, tone: 'pending', due };
  if (value === 'paid') return { label: 'Paid & Confirmed', compact: 'Paid', confirmed: true, tone: 'confirmed', due: null };
  if (free) return { label: 'Free entry · Confirmed', compact: 'Free entry', confirmed: true, tone: 'confirmed', due: null };
  if (value === 'refunded') return { label: 'Refunded', compact: 'Refunded', confirmed: false, tone: 'neutral', due: null };
  if (value === 'processing') return { label: 'Payment processing', compact: 'Processing', confirmed: false, tone: 'pending', due: null };
  if (value == null || value === '') return { label: 'Status unavailable', compact: 'Unavailable', confirmed: false, tone: 'neutral', due: null };
  return { label: 'Payment pending', compact: 'Pending', confirmed: false, tone: 'pending', due: null };
}
