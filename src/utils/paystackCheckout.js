import { PAYSTACK_PUBLIC_KEY } from './paystackConfig';
import { toPaystackAmount } from '../constants/fees';

export const PAYSTACK_CHECKOUT_CHANNELS = [
    'card',
    'bank',
    'ussd',
    'eft',
    'bank_transfer',
    'apple_pay',
];

export function splitPaystackCustomerName(fullName) {
    const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return { firstname: '', lastname: '' };
    return { firstname: parts[0], lastname: parts.slice(1).join(' ') };
}

export function buildPaystackCheckoutConfig({
    reference,
    email,
    amount,
    currency = 'ZAR',
    metadata,
    fullName,
}) {
    const { firstname, lastname } = splitPaystackCustomerName(fullName);
    return {
        key: PAYSTACK_PUBLIC_KEY,
        reference,
        email,
        firstname,
        lastname,
        amount: toPaystackAmount(amount),
        currency,
        channels: PAYSTACK_CHECKOUT_CHANNELS,
        metadata,
    };
}

export function isInAppBrowser() {
    if (typeof navigator === 'undefined') return false;
    return /FBAN|FBAV|Instagram|WhatsApp|Line|Snapchat/i.test(
        navigator.userAgent || navigator.vendor || window.opera,
    );
}
