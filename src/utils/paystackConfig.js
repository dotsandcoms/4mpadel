const cleanPaystackKey = (raw) =>
    String(raw || '')
        .trim()
        .replace(/^["']|["']$/g, '')
        .split(/\s+/)[0]
        .replace(/[^a-zA-Z0-9_]/g, '');

export const isLocalPaystackDev = () => {
    if (import.meta.env.DEV) return true;
    if (typeof window === 'undefined') return false;
    const host = window.location.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0';
};

const testKey = cleanPaystackKey(import.meta.env.VITE_PAYSTACK_PUBLIC_KEY_TEST);
const liveKey = cleanPaystackKey(import.meta.env.VITE_PAYSTACK_PUBLIC_KEY);

export const PAYSTACK_PUBLIC_KEY = (() => {
    if (isLocalPaystackDev()) {
        if (testKey.startsWith('pk_test')) return testKey;
        if (liveKey.startsWith('pk_test')) return liveKey;
        if (import.meta.env.DEV) {
            console.warn(
                '[Paystack] Local dev: set VITE_PAYSTACK_PUBLIC_KEY_TEST to your pk_test_ key.'
            );
        }
    }
    if (liveKey.startsWith('pk_')) return liveKey;
    if (testKey.startsWith('pk_')) return testKey;
    return '';
})();

export const isPaystackTestMode = PAYSTACK_PUBLIC_KEY.startsWith('pk_test');
export const isPaystackConfigured = () => PAYSTACK_PUBLIC_KEY.startsWith('pk_');
