/**
 * Shared Paystack helpers for Supabase Edge Functions.
 *
 * Configure both secrets in Supabase → Project Settings → Edge Functions:
 *   PAYSTACK_SECRET_KEY       = sk_live_...  (production payments)
 *   PAYSTACK_SECRET_KEY_TEST  = sk_test_...  (localhost / pk_test payments)
 *
 * The client sets `is_test` on each payment row; edge functions pick the matching secret.
 */

export function parseMetadata(raw: unknown): Record<string, unknown> {
    if (!raw) return {};
    if (typeof raw === 'string') {
        try {
            return JSON.parse(raw) as Record<string, unknown>;
        } catch {
            return {};
        }
    }
    if (typeof raw === 'object') return raw as Record<string, unknown>;
    return {};
}

/** true = test, false = live, null = legacy row with no flag */
export function getPaymentTestMode(payment: Record<string, unknown>): boolean | null {
    const meta = parseMetadata(payment.metadata);
    if (payment.is_test === true || meta.is_test === true) return true;
    if (payment.is_test === false || meta.is_test === false) return false;
    return null;
}

export function getPaystackSecretKeys(): { live: string; test: string } {
    return {
        live: (Deno.env.get('PAYSTACK_SECRET_KEY') ?? '').trim(),
        test: (Deno.env.get('PAYSTACK_SECRET_KEY_TEST') ?? '').trim(),
    };
}

/** Single secret for a known test/live payment */
export function getPaystackSecretForPayment(payment: Record<string, unknown>): string {
    const { live, test } = getPaystackSecretKeys();
    const mode = getPaymentTestMode(payment);
    if (mode === true) return test;
    if (mode === false) return live;
    return live || test;
}

export function resolvePaystackVerifySecrets(payment: Record<string, unknown>): {
    secrets: string[];
    mode: 'test' | 'live' | 'unknown';
    configError?: string;
} {
    const { live, test } = getPaystackSecretKeys();
    const paymentMode = getPaymentTestMode(payment);

    if (paymentMode === true) {
        if (!test) {
            return {
                secrets: [],
                mode: 'test',
                configError: 'PAYSTACK_SECRET_KEY_TEST is not configured (required for test payments)',
            };
        }
        return { secrets: [test], mode: 'test' };
    }

    if (paymentMode === false) {
        if (!live) {
            return {
                secrets: [],
                mode: 'live',
                configError: 'PAYSTACK_SECRET_KEY is not configured (required for live payments)',
            };
        }
        return { secrets: [live], mode: 'live' };
    }

    // Legacy payments created before is_test was stored — try both keys
    const secrets = [...new Set([live, test].filter(Boolean))];
    if (secrets.length === 0) {
        return {
            secrets: [],
            mode: 'unknown',
            configError: 'Paystack secret keys are not configured',
        };
    }
    return { secrets, mode: 'unknown' };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function verifyPaystackReference(
    reference: string,
    secrets: string[],
): Promise<
    | { ok: true; data: Record<string, unknown> }
    | { ok: false; status: string; message: string }
> {
    const pendingStatuses = new Set(['pending', 'processing', 'ongoing', 'queued', 'abandoned', '']);
    let lastStatus = 'unknown';
    let lastMessage = 'Payment not verified';

    if (secrets.length === 0) {
        return { ok: false, status: 'no_secret', message: 'Paystack secret key not configured' };
    }

    for (const secret of secrets) {
        for (let attempt = 0; attempt < 8; attempt++) {
            const verifyRes = await fetch(
                `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
                { headers: { Authorization: `Bearer ${secret}` } },
            );
            const verifyData = await verifyRes.json();

            if (verifyData?.status && verifyData?.data?.status === 'success') {
                return { ok: true, data: verifyData.data as Record<string, unknown> };
            }

            lastStatus = String(verifyData?.data?.status || verifyData?.status || 'unknown');
            lastMessage = String(verifyData?.message || lastMessage);

            const trxStatus = String(verifyData?.data?.status || '').toLowerCase();
            if (pendingStatuses.has(trxStatus) && attempt < 7) {
                await sleep(2000);
                continue;
            }

            break;
        }
    }

    return { ok: false, status: lastStatus, message: lastMessage };
}

async function hmacSha512Hex(key: string, message: string): Promise<string> {
    const enc = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        enc.encode(key),
        { name: 'HMAC', hash: 'SHA-512' },
        false,
        ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
    return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Validates webhook signature against live and/or test secrets */
export async function verifyPaystackWebhookSignature(
    rawBody: string,
    signature: string,
): Promise<boolean> {
    const { live, test } = getPaystackSecretKeys();
    for (const secret of [live, test].filter(Boolean)) {
        const expected = await hmacSha512Hex(secret, rawBody);
        if (signature === expected) return true;
    }
    return false;
}

export type PaystackFetchMode = 'live' | 'test' | 'both';

export function resolvePaystackFetchSecrets(mode: PaystackFetchMode = 'both'): {
    secrets: Array<{ key: string; mode: 'live' | 'test' }>;
    configError?: string;
} {
    const { live, test } = getPaystackSecretKeys();

    if (mode === 'live') {
        if (!live) return { secrets: [], configError: 'PAYSTACK_SECRET_KEY is not configured' };
        return { secrets: [{ key: live, mode: 'live' }] };
    }
    if (mode === 'test') {
        if (!test) return { secrets: [], configError: 'PAYSTACK_SECRET_KEY_TEST is not configured' };
        return { secrets: [{ key: test, mode: 'test' }] };
    }

    const secrets: Array<{ key: string; mode: 'live' | 'test' }> = [];
    if (live) secrets.push({ key: live, mode: 'live' });
    if (test) secrets.push({ key: test, mode: 'test' });
    if (secrets.length === 0) {
        return { secrets: [], configError: 'Paystack secret keys are not configured' };
    }
    return { secrets };
}
