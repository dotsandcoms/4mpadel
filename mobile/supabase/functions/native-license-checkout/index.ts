import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const money = (n: number) => Math.round(n * 100) / 100;
async function checked(query: any): Promise<any> { const { data, error } = await query; if (error) throw new Error('Licence checkout could not be saved. Please try again.'); return data; }
Deno.serve(async req => {
  // Fixed HTTPS callback for payment providers; never trusts a caller-supplied redirect.
  if (req.method === 'GET' && new URL(req.url).pathname.endsWith('/native-license-checkout/return')) {
    return new Response(null, { status: 302, headers: { Location: 'fourmpadel://license', 'Cache-Control': 'no-store' } });
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const client = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } });
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user?.email) return json({ error: 'Sign in again to manage your licence.' }, 401);
    const input = await req.json();
    if (!['quote', 'checkout', 'verify'].includes(input.action)) throw new Error('Choose a valid licence action.');
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const profile = await checked(admin.from('players').select('id,name,license_type,paid_registration').ilike('email', user.email.replace(/[\\%_]/g, '\\$&')).maybeSingle());
    if (!profile) throw new Error('Complete your player profile before purchasing a licence.');
    const active = profile.license_type === 'full' && profile.paid_registration === true;
    const secret = Deno.env.get('PAYSTACK_SECRET_KEY');
    async function gateway(path: string, body?: unknown) {
      if (!secret?.startsWith('sk_live_')) throw new Error('Licence payments are currently unavailable.');
      const response = await fetch(`https://api.paystack.co/transaction/${path}`, {
        method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000),
      });
      const result = await response.json();
      if (!response.ok || !result.status) throw new Error('The payment provider could not complete this request. Check payment status before trying again.');
      return result.data;
    }
    if (input.action === 'verify') {
      if (typeof input.reference !== 'string' || !/^LIC-[a-f0-9-]+$/.test(input.reference)) throw new Error('Invalid payment reference.');
      const saved = await checked(admin.from('native_license_checkouts').select('*').eq('reference', input.reference).eq('user_id', user.id).maybeSingle());
      if (!saved) throw new Error('No licence checkout was found for your account.');
      const payment = await gateway(`verify/${encodeURIComponent(saved.reference)}`);
      if (payment.status !== 'success') return json({ paid: false });
      const meta = typeof payment.metadata === 'string' ? JSON.parse(payment.metadata) : payment.metadata;
      if (payment.reference !== saved.reference || payment.domain !== 'live' || payment.currency !== 'ZAR' || payment.amount !== Math.round(Number(saved.amount) * 100)
        || payment.customer?.email?.toLowerCase() !== user.email.toLowerCase() || meta?.native_user_id !== user.id || meta?.license_type !== 'full' || !payment.id) {
        throw new Error('Payment details do not match this licence. Please contact support.');
      }
      // Same reference and shape as the existing licence webhook. Either path can finish safely.
      await checked(admin.from('payments').upsert({ player_id: saved.player_id, event_id: null, amount: Number(saved.amount), currency: 'ZAR', status: 'success', payment_type: 'membership', payment_method: 'paystack', reference: String(payment.id), is_test: false,
        metadata: { source: 'web_license_modal', license_type: 'full', client_reference: saved.reference, paystack_ref: String(payment.id), event_id: null, event_name: null },
      }, { onConflict: 'reference' }));
      await checked(admin.from('players').update({ license_type: 'full', paid_registration: true }).eq('id', saved.player_id));
      return json({ paid: true });
    }
    const config = await checked(admin.from('commerce_config').select('*').eq('id', 'default').maybeSingle());
    if (!config) throw new Error('Licence pricing is unavailable.');
    const base = Number(config.full_license_price), percent = Number(config.license_fee_percent);
    if (!Number.isFinite(base) || base <= 0 || !Number.isFinite(percent) || percent < 0 || percent > 100) throw new Error('Licence pricing is unavailable.');
    const fee = money(base * percent / 100);
    const quote = { base, fee, total: money(base + fee), feeLabel: config.fee_label || 'Service fee', enabled: config.full_license_enabled === true, active };
    if (input.action === 'quote') return json({ quote });
    if (active) throw new Error('Your full licence is already active.');
    if (!quote.enabled) throw new Error('Annual licence sales are currently closed.');
    if (input.agreed !== true || input.acceptedTotal !== quote.total) throw new Error('Review the current licence price before paying.');
    if (typeof input.attemptId !== 'string' || !/^[a-f0-9-]{36}$/.test(input.attemptId)) throw new Error('Invalid checkout attempt.');
    const reference = `LIC-${user.id}-${input.attemptId}`;
    await checked(admin.from('native_license_checkouts').upsert({ reference, user_id: user.id, player_id: profile.id, amount: quote.total, pricing: quote }, { onConflict: 'reference', ignoreDuplicates: true }));
    const saved = await checked(admin.from('native_license_checkouts').select('*').eq('reference', reference).eq('user_id', user.id).single());
    if (Number(saved.amount) !== quote.total) throw new Error('Pricing has changed. Please start a new licence checkout.');
    if (saved.authorization_url) return json({ reference, authorizationUrl: saved.authorization_url });
    const payment = await gateway('initialize', { email: user.email.toLowerCase(), amount: Math.round(quote.total * 100), currency: 'ZAR', reference,
      callback_url: `${url}/functions/v1/native-license-checkout/return`,
      metadata: { source: 'web_license_modal', native_user_id: user.id, license_type: 'full', pricing: quote },
    });
    const checkoutUrl = new URL(payment.authorization_url);
    if (checkoutUrl.protocol !== 'https:' || checkoutUrl.hostname !== 'checkout.paystack.com') throw new Error('The payment provider returned an unexpected address.');
    await checked(admin.from('native_license_checkouts').update({ authorization_url: checkoutUrl.href }).eq('reference', reference));
    return json({ reference, authorizationUrl: checkoutUrl.href });
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Licence checkout is unavailable.' }, 400); }
});
