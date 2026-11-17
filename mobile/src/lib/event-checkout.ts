import { supabase } from './supabase';

export type CheckoutInput = {
  mode?: 'pay'; paymentIntent?: 'pay' | 'reserve';
  selections?: ({ divisionId: string; partnerEmail?: string; payForSelf?: boolean; payForPartner?: boolean; licenseChoice?: 'temporary' | 'full'; tshirtSize?: string; tshirtLogoUrl?: string; tshirtSponsorName?: string })[];
  tshirtLogoUrl?: string; tshirtSponsorName?: string; partnerTshirtLogoUrl?: string; partnerTshirtSponsorName?: string;
  licenseChoice?: 'temporary' | 'full';
  eventId: number; divisionIds: string[]; partnerEmail: string; payForSelf?: boolean; payForPartner?: boolean;
  tshirtSize: string; partnerTshirtSize: string; accessGrantId: string | null; isTest: boolean;
};
export type Quote = {
  allowPayLater?: boolean; paymentIntent?: 'pay' | 'reserve';
  mode?: 'pay' | 'register'; entries?: { id: string; divisionId?: string; canCustomizePartner?: boolean; partnerEmail?: string; tshirtLogoUrl?: string; tshirtSponsorName?: string; partnerTshirtLogoUrl?: string; partnerTshirtSponsorName?: string; division: string; playerName: string; partnerName: string | null; paymentStatus: string; partnerPaymentStatus: string | null; payForSelf?: boolean; payForPartner?: boolean; amount?: number; playerCount?: number; unitFee?: number }[];
  licenseTotal?: number; licenseItems?: { label: string; amount: number }[];
  total: number; base: number; fee: number; feeLabel: string; lineItems: { label: string; amount: number }[];
  eventName: string; profileName: string; partnerName: string | null; method: string;
  divisionNames: string[]; isTest: boolean;
};
export type CheckoutResult = {
  quote: Quote; registered?: boolean; paymentPending?: boolean; emailWarning?: string; authorizationUrl?: string; reference?: string;
};
export async function invokeCheckout(input: CheckoutInput, checkout?: { attemptId: string; acceptedTotal: number; agreed: boolean }): Promise<CheckoutResult> {
  const controller = new AbortController();
  const timeout = checkout ? undefined : setTimeout(() => controller.abort(), 20000);
  let response;
  try { response = await supabase.functions.invoke('native-event-checkout', {
    signal: controller.signal,
    body: { ...input, ...checkout, action: checkout ? 'checkout' : 'quote' },
  }); } finally { if (timeout) clearTimeout(timeout); }
  const { data, error } = response;
  if (error) {
    let message = 'Could not reach registration. Check your connection and try again.';
    try { const detail = await error.context?.json(); if (detail?.error) message = detail.error; } catch { /* transport failure */ }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  if (!data?.quote) throw new Error('Registration returned an incomplete response. Please try again.');
  if (input.mode === 'pay' && data.quote.mode !== 'pay') throw new Error('Payment-only checkout needs a server update. Please use the website to pay your existing entry for now.');
  return data;
}
export async function confirmCheckout(reference: string) {
  const { data, error } = await supabase.functions.invoke('confirm-manual-payment', { body: { reference } });
  if (data?.needsReview) throw Object.assign(new Error(data.message || 'Payment received after checkout closed. Contact support before paying again.'), { code: 'PAYMENT_REVIEW' });
  if (error || data?.error || (!data?.processed && !data?.alreadyProcessed)) throw Object.assign(new Error('Payment is not confirmed yet. If you have paid, wait a moment and check again.'), { code: !error && data?.retry ? 'PAYMENT_NOT_CONFIRMED' : 'PAYMENT_STATUS_UNKNOWN' });
  return data;
}
export async function eventCheckoutState(reference: string): Promise<{ state: 'awaiting_payment' | 'paid' | 'expired' | 'review'; expiresAt?: string }> {
  const { data, error } = await supabase.rpc('event_checkout_state', { p_reference: reference });
  if (error || !data) throw new Error('Could not check this checkout. Please try again.');
  return data;
}
export async function cancelEventCheckout(reference: string) {
  const { data, error } = await supabase.rpc('cancel_event_checkout', { p_reference: reference });
  if (error || !data) throw new Error('Could not cancel this checkout. Please check its payment status.');
  if (data.paymentReceived) throw new Error('Payment was received. Check its status before starting again.');
}
