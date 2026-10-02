import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { entryBalance } from './balance.ts';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const checked = async (q: any) => { const { data, error } = await q; if (error) throw error; return data; };
const fail = (s: string): never => { throw new Error(s); };
const norm = (s: unknown) => String(s || '').trim().toLowerCase();
const validRef = (s: string) => /^MBAL-[a-f0-9]{48}$/.test(s);
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method === 'GET' && new URL(req.url).pathname.endsWith('/native-entry-balance/return')) {
    const p = new URL(req.url).searchParams, ref = p.get('reference') || p.get('trxref') || '';
    if (!validRef(ref)) return json({ error: 'Invalid return.' }, 400);
    return new Response(null, { status: 302, headers: { Location: `fourmpadel://events/pay-balance?reference=${ref}`, 'Cache-Control': 'no-store' } });
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const client = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } });
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user?.email) return json({ error: 'Sign in to view your entry balance.' }, 401);
    const input = await req.json(), email = norm(user.email);
    if (!['summary', 'quote', 'checkout', 'confirm'].includes(input.action)) fail('Invalid balance action.');
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    let saved: any = null;
    if (input.reference) {
      if (!validRef(input.reference)) fail('Invalid payment reference.');
      saved = await checked(admin.from('payments').select('*').eq('reference', input.reference).maybeSingle());
      if (!saved || saved.metadata?.source !== 'native_entry_balance' || saved.metadata?.user_id !== user.id) fail('This payment does not belong to your account.');
    }
    const reg = input.action === 'summary' ? null : await checked(admin.from('event_registrations').select('*').eq('id', saved?.metadata.registration_id || input.registrationId).maybeSingle());
    if (input.action !== 'summary' && (!reg || norm(reg.email) !== email)) fail('Entry not found for your account.');
    const eventId = reg?.event_id || Number(input.eventId);
    const event = await checked(admin.from('calendar').select('*').eq('id', eventId).maybeSingle());
    if (!event) fail('Event not found.');
    const divisions = await checked(admin.from('tournament_divisions').select('*').eq('event_id', eventId));
    const payments = await checked(admin.from('payments').select('*').eq('event_id', eventId));
    const balanceFor = (r: any) => entryBalance(event, divisions.find((d: any) => d.id === r.division_id || d.name === r.division), r, payments);
    if (input.action === 'summary') {
      const regs = await checked(admin.from('event_registrations').select('*').eq('event_id', eventId).ilike('email', email.replace(/[\\%_]/g, '\\$&')).neq('status', 'withdrawn'));
      return json({ balances: regs.map(balanceFor) });
    }
    const secret = Deno.env.get('PAYSTACK_SECRET_KEY');
    const gateway = async (path: string, body?: any) => {
      if (!secret?.startsWith('sk_live_')) fail('Payments are unavailable.');
      const response = await fetch(`https://api.paystack.co/transaction/${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) });
      const data = await response.json(); if (!response.ok || !data.status) fail('Could not reach the payment provider. Check payment status before trying again.'); return data.data;
    };
    if (input.action === 'confirm') {
      if (!saved) fail('Saved payment not found.');
      const verified = await gateway(`verify/${encodeURIComponent(saved.reference)}`);
      if (verified.status !== 'success') return json({ pending: true, message: 'Payment is not confirmed yet. Your saved payment can be resumed.' });
      const meta = typeof verified.metadata === 'string' ? JSON.parse(verified.metadata) : verified.metadata;
      if (verified.reference !== saved.reference || verified.currency !== 'ZAR' || verified.domain !== 'live' || verified.amount !== Math.round(Number(saved.amount) * 100) || norm(verified.customer?.email) !== email || meta?.user_id !== user.id || meta?.registration_id !== reg.id) fail('Payment verification did not match this entry.');
      await checked(admin.from('payments').update({ status: 'success', metadata: { ...saved.metadata, verified_balance: true } }).eq('id', saved.id));
      const freshPayments = payments.filter((p: any) => p.id !== saved.id).concat({ ...saved, status: 'success', metadata: { ...saved.metadata, verified_balance: true } });
      const balance = entryBalance(event, divisions.find((d: any) => d.id === reg.division_id || d.name === reg.division), reg, freshPayments);
      return json({ paid: true, eventId, balance });
    }
    if (!event.is_manual || event.event_status === 'cancelled' || reg.status === 'withdrawn') fail('This entry is not available for payment.');
    const balance = balanceFor(reg);
    if (!balance.known) fail('The original entry payment needs reconciliation. Contact the organiser; do not pay the full entry fee again.');
    const quote = { ...balance, eventId, eventName: event.event_name, total: balance.due };
    const pending = payments.find((p: any) => p.metadata?.source === 'native_entry_balance' && p.metadata?.registration_id === reg.id && p.metadata?.user_id === user.id && p.status === 'processing');
    if (pending && (input.action === 'quote' || pending.metadata.authorization_url)) return json({ quote: pending.metadata.quote, reference: pending.reference, authorizationUrl: pending.metadata.authorization_url || null });
    if (input.action === 'quote') return json({ quote });
    if (!['platform', undefined, null].includes(event.payment_method) || event.allow_payments === false) fail('This event accepts payment through the organiser.');
    if (reg.payment_status !== 'paid') fail('Complete your original entry checkout before paying an adjustment.');
    if (!balance.due || balance.due <= 0) fail('Your entry has no outstanding balance.');
    if (balance.due < 1) fail('Your outstanding balance is below Paystack’s R1.00 minimum payment. It remains outstanding; you have not been charged. Contact the organiser to settle this small balance.');
    if (Number(input.acceptedTotal) !== balance.due || (pending && Number(pending.amount) !== balance.due)) fail('The entry balance changed. Refresh the payment review.');
    // Keep an in-progress checkout resumable, but never recycle the reference of
    // an abandoned or failed attempt. Paystack and payments.reference both treat
    // that reference as already used.
    const reference = pending?.reference || 'MBAL-' + Array.from(crypto.getRandomValues(new Uint8Array(24))).map(v => v.toString(16).padStart(2, '0')).join('');
    const profile = await checked(admin.from('players').select('id').ilike('email', email.replace(/[\\%_]/g, '\\$&')).maybeSingle());
    const metadata = { source: 'native_entry_balance', user_id: user.id, registrant_email: email, registration_id: reg.id, event_id: eventId, event_name: event.event_name, division: reg.division, quote,
      covers: [{ type: 'entry', email, division: reg.division }], division_entry_fees: { [reg.division]: balance.due } };
    if (!pending) await checked(admin.from('payments').insert({ reference, player_id: profile?.id || null, event_id: eventId, amount: balance.due, currency: 'ZAR', status: 'processing', payment_type: 'event_entry_fee', payment_method: 'paystack', is_test: false, metadata }));
    const result = await gateway('initialize', { reference, email, amount: Math.round(balance.due * 100), currency: 'ZAR', metadata, callback_url: `${url}/functions/v1/native-entry-balance/return` });
    if (!result.authorization_url?.startsWith('https://checkout.paystack.com/')) fail('Invalid checkout address.');
    await checked(admin.from('payments').update({ metadata: { ...metadata, authorization_url: result.authorization_url } }).eq('reference', reference));
    return json({ quote, reference, authorizationUrl: result.authorization_url });
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Please retry this payment or contact the organiser if it keeps failing.' }, 400); }
});
