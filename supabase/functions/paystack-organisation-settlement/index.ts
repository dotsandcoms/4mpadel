import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const url = Deno.env.get('SUPABASE_URL') || '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
const mode = Deno.env.get('PAYSTACK_ORGANISATION_SETTLEMENT_MODE') === 'test' ? 'test' : 'live';
const fundingConfirmed = Deno.env.get('PAYSTACK_ORGANISATION_REFUND_FUNDING') === 'confirmed';
const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json',
};
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { headers, status });
const payerError = 'Online payments are paused for this tournament. Contact the organiser.';

async function rpc(client: SupabaseClient, name: string, args: Record<string, unknown> = {}) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw new Error(error.message);
    return data;
}

function paystackSecret(domain: string) {
    const key = Deno.env.get(domain === 'test' ? 'PAYSTACK_SECRET_KEY_TEST' : 'PAYSTACK_SECRET_KEY');
    if (!key?.startsWith(domain === 'test' ? 'sk_test_' : 'sk_live_')) {
        throw new Error('Paystack is unavailable for this environment.');
    }
    return key;
}

async function getSubaccount(code: unknown, domain: string, requireVerified: boolean) {
    if (typeof code !== 'string' || !/^ACCT_[a-z0-9]{6,60}$/i.test(code)) {
        throw new Error('Enter a Paystack subaccount code starting with ACCT_.');
    }
    const secret = paystackSecret(domain);
    const response = await fetch(`https://api.paystack.co/subaccount/${encodeURIComponent(code)}`, {
        headers: { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(10000),
    });
    const result = await response.json();
    const a = result?.data;
    if (!response.ok || !result.status || a?.subaccount_code !== code || a?.domain !== domain) {
        throw new Error('This subaccount was not found in the current Paystack environment.');
    }
    if (![true, 1].includes(a.active) || a.currency !== 'ZAR'
        || a.percentage_charge == null || Number(a.percentage_charge) !== 0 || !a.account_name
        || !Number.isSafeInteger(Number(a.id)) || Number(a.id) <= 0) {
        throw new Error('Use an active ZAR subaccount with the 4M share set to 0%.');
    }
    if (requireVerified && domain === 'live' && a.is_verified !== true) {
        throw new Error('Verify this payout subaccount in Paystack before enabling routing.');
    }
    return {
        code,
        providerId: Number(a.id),
        domain,
        businessName: String(a.business_name || a.account_name),
        accountHolder: String(a.account_name),
        bankName: String(a.settlement_bank || ''),
        lastFour: String(a.account_number || '').match(/\d{4}$/)?.[0] || null,
        verified: a.is_verified === true,
    };
}

async function initialize(admin: SupabaseClient, paymentId: string, nativeMode?: 'register' | 'pay') {
    const plan = await rpc(admin, 'prepare_paystack_split', { p_payment: paymentId, p_funding_confirmed: fundingConfirmed });
    if (!plan) return { legacy: true };
    const { data: payment, error } = await admin.from('payments')
        .select('reference,event_id,amount,is_test,metadata').eq('id', paymentId).single();
    if (error || !payment) throw new Error('The saved checkout could not be found.');
    const domain = payment.is_test ? 'test' : 'live';
    if (!plan.licenceOnly && (domain !== mode || (domain === 'live' && !fundingConfirmed))) throw new Error(payerError);
    if (plan.checkout) return plan.checkout;
    if (!plan.licenceOnly) {
        try {
            const account = await getSubaccount(plan.code, domain, true);
            if (account.providerId !== Number(plan.provider_id)) throw new Error(payerError);
        } catch {
            await rpc(admin, 'manage_paystack_subaccounts', { p_action: 'pause', p_org: plan.organisation_id,
                p_payload: { eventId: plan.event_id } }).catch(() => undefined);
            throw new Error(payerError);
        }
    }

    const secret = paystackSecret(domain);
    const response = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(12000),
        body: JSON.stringify({
            email: payment.metadata.registrant_email,
            amount: plan.amount_cents ?? Math.round(Number(payment.amount) * 100),
            currency: 'ZAR',
            reference: payment.reference,
            metadata: payment.metadata,
            channels: ['card', 'eft', 'bank_transfer', 'apple_pay'],
            ...(nativeMode ? { callback_url: `${url}/functions/v1/native-event-checkout/return?event_id=${payment.event_id}${nativeMode === 'pay' ? '&mode=pay' : ''}` } : {}),
            ...(plan.licenceOnly ? {} : {
                subaccount: plan.code,
                bearer: 'subaccount',
                ...(plan.retained_cents > 0 ? { transaction_charge: plan.retained_cents } : {}),
            }),
        }),
    });
    const result = await response.json();
    const checkout = result?.data;
    if (!response.ok || !result.status || checkout?.reference !== payment.reference
        || typeof checkout.authorization_url !== 'string' || typeof checkout.access_code !== 'string') {
        if (!plan.licenceOnly) {
            const saved = await rpc(admin, 'paystack_split_checkout', { p_reference: payment.reference });
            if (saved) return saved;
            if (response.status === 400 && /subaccount|split|bearer/i.test(String(result?.message || ''))) {
                await rpc(admin, 'manage_paystack_subaccounts', { p_action: 'pause', p_org: plan.organisation_id,
                    p_payload: { eventId: plan.event_id } }).catch(() => undefined);
                throw new Error(payerError);
            }
        }
        throw new Error('Could not start checkout. Start a new payment attempt.');
    }
    const output = { authorizationUrl: checkout.authorization_url, accessCode: checkout.access_code };
    if (plan.licenceOnly) return output;
    return await rpc(admin, 'paystack_split_checkout', { p_reference: payment.reference, p_checkout: output });
}

Deno.serve(async (request) => {
    if (request.method === 'OPTIONS') return new Response(null, { headers });
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
    const auth = request.headers.get('Authorization') || '';
    try {
        const input = await request.json();
        const admin = createClient(url, serviceKey);
        if (input.action === 'native_checkout') {
            if (!serviceKey || auth !== `Bearer ${serviceKey}`) return json({ error: 'Access denied.' }, 403);
            return json(await initialize(admin, input.paymentId, input.mode === 'pay' ? 'pay' : 'register'));
        }
        const client = createClient(url, anonKey, { global: { headers: { Authorization: auth } } });
        const { data: { user }, error } = await client.auth.getUser();
        if (error || !user) return json({ error: 'Sign in again to continue.' }, 401);
        if (input.action === 'web_checkout') {
            const p = await rpc(client, 'prepare_web_paystack_split', { p_payment: input.payment });
            return json(p.legacy ? p : await initialize(admin, p.paymentId));
        }
        if (!await rpc(client, 'can_manage_paystack_subaccounts')) return json({ error: 'Access denied.' }, 403);

        const manage = (action: string, payload: Record<string, unknown> = {}) => rpc(admin, 'manage_paystack_subaccounts', {
            p_action: action, p_org: input.organisationId ?? null, p_payload: payload, p_actor: user.id,
        });
        switch (input.action) {
            case 'list':
                return json({ organisations: await manage('list'), mode, canEnable: mode === 'test' || fundingConfirmed });
            case 'events':
                return json(await manage('events'));
            case 'preview':
                return json({ account: await getSubaccount(input.code?.trim(), mode, false) });
            case 'save': {
                const account = await getSubaccount(input.code?.trim(), mode, false);
                if (account.accountHolder !== input.accountHolder || account.lastFour !== input.lastFour) {
                    throw new Error('Verify the Paystack account details again before saving.');
                }
                return json({ account: await manage('save', { ...account, expectedVersion: input.expectedVersion }) });
            }
            case 'enable': {
                if (mode === 'live' && !fundingConfirmed) {
                    throw new Error('Live routing is disabled until Paystack confirms organisation-funded refunds.');
                }
                const { account } = await manage('events');
                const verified = await getSubaccount(account?.code, mode, true);
                if (verified.lastFour !== account?.last_four || verified.bankName !== account?.bank_name
                    || verified.businessName !== account?.business_name) {
                    throw new Error('The Paystack account details changed. Review and save the account again.');
                }
                return json(await manage('enable', { eventId: input.eventId, verifiedCode: verified.code, verifiedVersion: account.updated_at }));
            }
            case 'pause':
                return json(await manage('pause', { eventId: input.eventId }));
            default:
                return json({ error: 'Unknown Paystack subaccount action.' }, 400);
        }
    } catch (error) {
        return json({ error: error instanceof Error ? error.message : 'Paystack subaccounts are temporarily unavailable.' }, 400);
    }
});
