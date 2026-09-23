import { supabase } from './supabase';

export type CheckoutInput = {
  mode?: 'pay';
  selections?: ({ divisionId: string; partnerEmail?: string; payForPartner?: boolean; licenseChoice?: 'temporary' | 'full'; tshirtSize?: string; tshirtLogoUrl?: string; tshirtSponsorName?: string })[];
  tshirtLogoUrl?: string; tshirtSponsorName?: string; partnerTshirtLogoUrl?: string; partnerTshirtSponsorName?: string;
  licenseChoice?: 'temporary' | 'full';
  eventId: number; divisionIds: string[]; partnerEmail: string; payForPartner?: boolean;
  tshirtSize: string; partnerTshirtSize: string; accessGrantId: string | null; isTest: boolean;
};
export type Quote = {
  mode?: 'pay' | 'register'; entries?: { id: string; divisionId?: string; canCustomizePartner?: boolean; partnerEmail?: string; tshirtLogoUrl?: string; tshirtSponsorName?: string; partnerTshirtLogoUrl?: string; partnerTshirtSponsorName?: string; division: string; playerName: string; partnerName: string | null; paymentStatus: string; partnerPaymentStatus: string | null; amount?: number; playerCount?: number; unitFee?: number }[];
  licenseTotal?: number; licenseItems?: { label: string; amount: number }[];
  total: number; base: number; fee: number; feeLabel: string; lineItems: { label: string; amount: number }[];
  eventName: string; profileName: string; partnerName: string | null; method: string;
  divisionNames: string[]; isTest: boolean;
};
export type CheckoutResult = {
  quote: Quote; registered?: boolean; paymentPending?: boolean; authorizationUrl?: string; reference?: string;
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
  if (error || data?.error || (!data?.processed && !data?.alreadyProcessed)) throw new Error('Payment is not confirmed yet. If you have paid, wait a moment and check again.');
  return data;
}
