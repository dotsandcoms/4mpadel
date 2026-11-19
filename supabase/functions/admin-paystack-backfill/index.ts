import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.3';
import { getPaystackSecretKeys } from '../_shared/paystack.ts';
import { createBackfillHandler } from './handler.mjs';

const url = Deno.env.get('SUPABASE_URL') || '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const actorClient = (token: string) => createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
});
const database = () => createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

Deno.serve(createBackfillHandler({
    async authorize(token: string) {
        const client = actorClient(token);
        const { data: auth, error } = await client.auth.getUser(token);
        if (error || !auth?.user?.id || !auth.user.email) return null;
        const [user, admin] = await Promise.all([
            client.rpc('account_is_active'),
            client.rpc('is_super_admin', { user_email: auth.user.email }),
        ]);
        return !user.error && user.data === true && !admin.error && admin.data === true ? auth.user : null;
    },
    async verify(reference: string) {
        const { live } = getPaystackSecretKeys();
        if (!live.startsWith('sk_live_')) throw new Error('Live verification unavailable.');
        const result = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
            method: 'GET', headers: { Authorization: `Bearer ${live}` }, signal: AbortSignal.timeout(10000),
        });
        if ([400,404].includes(result.status)) return null;
        if (!result.ok) throw new Error('Live verification unavailable.');
        const envelope = await result.json();
        return envelope?.status === true ? envelope.data : null;
    },
    async hasRefunds(providerId: string) {
        const { live } = getPaystackSecretKeys();
        if (!live.startsWith('sk_live_')) throw new Error('Live verification unavailable.');
        for (let page = 1; page <= 5; page++) {
            const query = new URLSearchParams({ transaction:providerId, perPage:'100', page:String(page) });
            const result = await fetch(`https://api.paystack.co/refund?${query}`, {
                method:'GET', headers:{ Authorization:`Bearer ${live}` }, signal:AbortSignal.timeout(8500),
            });
            const envelope = result.ok ? await result.json() : null;
            if (envelope?.status !== true || !Array.isArray(envelope.data)) throw new Error('Refund verification unavailable.');
            if (envelope.data.some((row: Record<string, unknown>) => String(row.status || '').toLowerCase() !== 'failed')) return true;
            if (envelope.data.length < 100 || (Number.isInteger(envelope.meta?.pageCount)
                && page >= envelope.meta.pageCount)) return false;
        }
        throw new Error('Refund verification unavailable.');
    },
    async recover(actor: string, charge: Record<string, unknown>, plan?: Record<string, unknown>, reason?: string) {
        const { data, error } = await database().rpc('admin_paystack_receipt_backfill', {
            p_actor: actor, p_charge: charge, ...(plan ? { p_review: plan, p_reason: reason } : {}),
        });
        if (error || !data) throw new Error('Receipt recording unavailable.');
        return data;
    },
}));
