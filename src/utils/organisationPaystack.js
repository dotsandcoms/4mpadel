import { supabase } from '../supabaseClient';

export async function organisationPaystack(action, input = {}) {
    const { data, error } = await supabase.functions.invoke('paystack-organisation-settlement', {
        body: { action, ...input },
    });
    if (error) {
        const response = error.context;
        const details = await response?.json?.().catch(() => null);
        if (action === 'list' && response?.status === 404) {
            throw new Error('Paystack Subaccounts needs its Supabase backend deployed before organisations can be loaded.');
        }
        throw new Error(details?.error || 'Paystack is temporarily unavailable. Please try again.');
    }
    if (!data) throw new Error('Paystack did not return a response. Please try again.');
    return data;
}

export async function prepareWebEventPayment(payment) {
    const checkout = await organisationPaystack('web_checkout', { payment });
    if (checkout.legacy) {
        const { error } = await supabase.from('payments').insert(payment);
        if (error) throw error;
    } else if (!checkout.accessCode) {
        throw new Error('Checkout did not start. Please try again.');
    }
    return checkout;
}

export function openEventPayment(popup, checkout, legacyOptions, callbacks) {
    if (checkout.accessCode) return popup.resumeTransaction(checkout.accessCode, callbacks);
    return popup.checkout({ ...legacyOptions, ...callbacks });
}
