import { entryBalance } from '../native-entry-balance/balance.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const norm = (v: unknown) => String(v || '').trim().toLowerCase();
const checked = async (q: any) => { const { data, error } = await q; if (error) throw error; return data; };
const fail = (s: string): never => { throw new Error(s); };
const cents = (v: unknown) => Math.round(Number(v) * 100);
const referenceOK = (v: string) => /^MSWITCH-[a-f0-9]{48}$/.test(v);
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = Deno.env.get('SUPABASE_URL')!;
  if (req.method === 'GET' && new URL(req.url).pathname.endsWith('/native-division-switch/return')) {
    const p = new URL(req.url).searchParams, reference = p.get('reference') || p.get('trxref') || '';
    if (!referenceOK(reference)) return json({ error: 'Invalid payment return.' }, 400);
    return new Response(null, { status: 302, headers: { Location: `fourmpadel://events/switch-division?reference=${reference}`, 'Cache-Control': 'no-store' } });
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const auth = req.headers.get('Authorization') || '';
    const client = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user?.email) return json({ error: 'Sign in to manage your entry.' }, 401);
    const email = norm(user.email), input = await req.json();
    if (!['quote', 'checkout', 'confirm'].includes(input.action)) fail('Invalid switch action.');
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    let payment: any = null;
    if (input.reference) {
      if (!referenceOK(input.reference)) fail('Invalid payment reference.');
      payment = await checked(admin.from('payments').select('*').eq('reference', input.reference).maybeSingle());
      if (!payment || payment.metadata?.native_switch !== true || norm(payment.metadata?.registrant_email) !== email) fail('This checkout does not belong to your account.');
    }
    const regId = payment?.metadata.registration_id || input.registrationId;
    const targetId = payment?.metadata.target_division_id || input.targetDivisionId;
    if (!regId || !targetId) fail('Choose an entry and a division.');
    const reg = await checked(admin.from('event_registrations').select('*').eq('id', regId).maybeSingle());
    if (!reg || norm(reg.email) !== email) fail('You can only switch your own entry.');
    if (payment && Number(payment.event_id) !== Number(reg.event_id)) fail('Payment does not match this event.');
    const event = await checked(admin.from('calendar').select('*').eq('id', reg.event_id).maybeSingle());
    const divisions = await checked(admin.from('tournament_divisions').select('*').eq('event_id', reg.event_id));
    const target = divisions?.find((d: any) => d.id === targetId);
    const from = divisions?.find((d: any) => d.id === reg.division_id || d.name === reg.division);
    if (!event || !target || !from) fail('This entry or division is no longer available.');
    const secret = Deno.env.get('PAYSTACK_SECRET_KEY');
    const gateway = async (path: string, body?: any) => {
      if (!secret?.startsWith('sk_live_')) fail('Payments are not configured.');
      const response = await fetch(`https://api.paystack.co/transaction/${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const result = await response.json();
      if (!response.ok || !result.status) fail('Could not contact the payment provider. Please retry.');
      return result.data;
    };
    if (input.action === 'confirm') {
      if (!payment) fail('No saved checkout found.');
      const verified = await gateway(`verify/${encodeURIComponent(payment.reference)}`);
      if (verified.status !== 'success') return json({ pending: true, message: 'Payment is not confirmed yet. If you cancelled, your original entry is unchanged.' });
      if (verified.reference !== payment.reference || verified.currency !== 'ZAR' || verified.amount !== cents(payment.amount) || norm(verified.customer?.email) !== email || verified.domain !== 'live') fail('Payment verification did not match this checkout.');
      if (payment.metadata.switch_completed === true) return json({ switched: true, eventId: reg.event_id, targetName: target.name });
      if (reg.division_id === target.id && reg.status !== 'withdrawn') {
        const latest = await checked(admin.from('payments').select('metadata').eq('id', payment.id).maybeSingle());
        await checked(admin.from('payments').update({ metadata: { ...latest.metadata, switch_completed: true } }).eq('id', payment.id));
        return json({ switched: true, eventId: reg.event_id, targetName: target.name });
      }
      if (reg.division_id !== payment.metadata.from_division_id || reg.status === 'withdrawn' || reg.payment_status !== 'paid') fail('Payment received, but your entry changed. Contact the organiser; do not pay again.');
      if (cents(target.entry_fee || 0) - cents(from.entry_fee || 0) !== cents(payment.amount)) fail('Payment received, but division pricing changed. Contact the organiser; do not pay again.');
      if (event.event_status === 'cancelled') fail('Payment received, but the event was cancelled. Contact the organiser; do not pay again.');
      const lockTime = Number(payment.metadata.native_switch_lock_at || 0);
      if (payment.metadata.native_switch_lock && Date.now() - lockTime < 120000) return json({ pending: true, message: 'Your division switch is processing. Check again shortly.' });
      const lockId = crypto.randomUUID();
      const claimed = await checked(admin.from('payments').update({ metadata: { ...payment.metadata, native_switch_lock: lockId, native_switch_lock_at: Date.now() } }).eq('id', payment.id).eq('metadata', JSON.stringify(payment.metadata)).select('id').maybeSingle());
      if (!claimed) return json({ pending: true, message: 'Your division switch is processing. Check again shortly.' });
      try {
      // The established service owns the actual move, partner unlinking, ledger
      // allocation, notifications and deadline validation. Forward the user JWT.
      const response = await fetch(`${url}/functions/v1/paystack-refund`, { method: 'POST', headers: { Authorization: auth, apikey: Deno.env.get('SUPABASE_ANON_KEY')!, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'switch_division', registration_id: reg.id, target_division_id: target.id, top_up_reference: payment.reference, move_team: false }) });
      const result = await response.json();
      if (!response.ok || !result.switched) fail(`Payment received, but the switch is not complete: ${result.message || result.error || 'Please retry.'} Do not pay again.`);
      const latest = await checked(admin.from('payments').select('metadata').eq('id', payment.id).maybeSingle());
        await checked(admin.from('payments').update({ metadata: { ...latest.metadata, switch_completed: true } }).eq('id', payment.id));
      return json({ switched: true, eventId: reg.event_id, targetName: target.name });
      } finally {
        const latest = await checked(admin.from('payments').select('metadata').eq('id', payment.id).maybeSingle());
        if (latest?.metadata?.native_switch_lock === lockId) await checked(admin.from('payments').update({ metadata: { ...latest.metadata, native_switch_lock: null } }).eq('id', payment.id).eq('metadata->>native_switch_lock', lockId));
      }
    }
    if (!event.is_manual || event.event_status === 'cancelled' || reg.status === 'withdrawn' || reg.payment_status !== 'paid') fail('This entry cannot be switched with a top-up.');
    if (target.is_active === false || target.id === reg.division_id) fail('Choose another active division.');
    const now = Date.now();
    if ([event.registration_closes_at, from.entries_close_at, target.entries_close_at].some(v => v && new Date(v).getTime() <= now)) fail('Registration has closed.');
    if (event.registration_opens_at && new Date(event.registration_opens_at).getTime() > now) fail('Registration has not opened.');
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg' }).format(new Date());
    if (String(event.end_date || event.start_date || '9999').slice(0, 10) < today) fail('This event has finished.');
    const existing = await checked(admin.from('event_registrations').select('email, partner_email').eq('event_id', reg.event_id).eq('division', target.name).neq('status', 'withdrawn'));
    if (existing?.some((r: any) => norm(r.email) === email || norm(r.partner_email) === email)) fail('You are already entered in that division.');
    const paidRows = await checked(admin.from('payments').select('*').eq('event_id', reg.event_id));
    const existingBalance = entryBalance(event, from, reg, paidRows);
    if (Number(existingBalance.due) > 0) fail('Pay your current entry balance before switching divisions.');
    const amountCents = cents(target.entry_fee || 0) - cents(from.entry_fee || 0);
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) fail('No additional payment is required for this switch.');
    const quote = { eventId: event.id, eventName: event.event_name, registrationId: reg.id, targetDivisionId: target.id, fromName: from.name, targetName: target.name, oldFee: Number(from.entry_fee || 0), newFee: Number(target.entry_fee || 0), total: amountCents / 100, partnerName: reg.partner_name || null };
    // Recover one pending attempt across app restarts and changed selections.
    const attempts = await checked(admin.from('payments').select('*').eq('event_id', reg.event_id).contains('metadata', { native_switch: true, registration_id: reg.id, registrant_email: email }).order('created_at', { ascending: false }).limit(20));
    const pending = attempts?.find((p: any) => !p.metadata.switch_completed && ['processing', 'success'].includes(p.status));
    if (pending && (input.action === 'quote' || pending.metadata.native_authorization_url)) return json({ quote: pending.metadata.quote, reference: pending.reference, authorizationUrl: pending.metadata.native_authorization_url || null });
    if (pending && (pending.metadata.target_division_id !== target.id || cents(pending.amount) !== amountCents)) fail('Resume your previous switch before starting another.');
    if (input.action === 'quote') return json({ quote });
    if (cents(input.acceptedTotal) !== amountCents) fail('The price changed. Review the updated amount.');
    const fingerprint = [user.id, reg.id, reg.division_id, reg.updated_at || reg.created_at, target.id, amountCents].join(':');
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fingerprint));
    const reference = pending?.reference || 'MSWITCH-' + Array.from(new Uint8Array(digest)).map(v => v.toString(16).padStart(2, '0')).join('').slice(0, 48);
    const profile = await checked(admin.from('players').select('id').ilike('email', email).maybeSingle());
    const metadata = { source: 'division_switch', native_switch: true, registration_id: reg.id, from_division_id: from.id, from_division: from.name, target_division_id: target.id, target_division: target.name, event_id: event.id, event_name: event.event_name, email, registrant_email: email, reference, quote };
    if (!pending) await checked(admin.from('payments').insert({ player_id: profile?.id || null, event_id: event.id, amount: quote.total, currency: 'ZAR', status: 'processing', payment_type: 'event_entry_fee', payment_method: 'paystack', reference, is_test: false, metadata }));
    const result = await gateway('initialize', { email, amount: amountCents, currency: 'ZAR', reference, metadata, callback_url: `${url}/functions/v1/native-division-switch/return` });
    if (!result.authorization_url?.startsWith('https://checkout.paystack.com/')) fail('Checkout returned an invalid payment URL.');
    await checked(admin.from('payments').update({ metadata: { ...metadata, native_authorization_url: result.authorization_url } }).eq('reference', reference));
    return json({ quote, reference, authorizationUrl: result.authorization_url });
  } catch (error) { return json({ error: error instanceof Error ? error.message : 'Could not switch division.' }, 400); }
});
