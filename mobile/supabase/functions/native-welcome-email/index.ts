import { createClient } from 'npm:@supabase/supabase-js@2';
import { welcomePayload } from './template.ts';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const auth = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('authorization') || '' } } });
    const { data: { user } } = await auth.auth.getUser();
    if (!user?.email || !user.email_confirmed_at) return json({ error: 'Verified account required' }, 401);
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const email = user.email.toLowerCase();
    // Ignore client recipients, names and templates. Only an existing own profile is eligible.
    const { data: player, error: playerError } = await db.from('players').select('name').eq('email', email).limit(1).maybeSingle();
    if (playerError) throw playerError;
    if (!player) return json({ error: 'Create your player profile first' }, 409);
    const apiKey = Deno.env.get('RESEND_API_KEY');
    if (!apiKey) throw new Error('Email service is not configured');
    const sender = Deno.env.get('RESEND_VERIFIED_SENDER') || 'notifications.4mpadel.co.za';
    // Do not silently redirect a player's welcome email to a sandbox owner.
    if (sender === 'onboarding@resend.dev') throw new Error('A verified sender is required');
    const { error: insertError } = await db.from('native_welcome_emails').upsert({ user_id: user.id, payload: welcomePayload(email, player.name || 'Player', sender) }, { onConflict: 'user_id', ignoreDuplicates: true });
    if (insertError) throw insertError;
    const { data: row, error: readError } = await db.from('native_welcome_emails').select('*').eq('user_id', user.id).single();
    if (readError) throw readError;
    if (row.status === 'sent') return json({ success: true, alreadySent: true });
    if (row.status === 'needs_review') return json({ needsReview: true }, 202);
    // Resend retains idempotency for 24h. Never risk replaying an uncertain send after that window.
    if (row.first_attempt_at && Date.now() - Date.parse(row.first_attempt_at) >= 23 * 3600000) {
      await db.from('native_welcome_emails').update({ status: 'needs_review', last_error: 'Delivery could not be confirmed within the safe retry window' }).eq('user_id', user.id).eq('status', 'pending');
      return json({ needsReview: true }, 202);
    }
    const now = new Date().toISOString();
    const { data: claim, error: claimError } = await db.from('native_welcome_emails').update({ first_attempt_at: row.first_attempt_at || now, next_attempt_at: new Date(Date.now() + 60000).toISOString() }).eq('user_id', user.id).eq('status', 'pending').lte('next_attempt_at', now).select('user_id').maybeSingle();
    if (claimError) throw claimError;
    if (!claim) return json({ pending: true }, 202);
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `native-welcome/${user.id}` },
        body: JSON.stringify(row.payload), signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error(`Email provider returned ${response.status}`);
      const result = await response.json();
      if (!result.id) throw new Error('Email provider did not confirm acceptance');
      const { error } = await db.from('native_welcome_emails').update({ status: 'sent', sent_at: new Date().toISOString(), provider_id: result.id, last_error: null }).eq('user_id', user.id);
      if (error) throw error;
      return json({ success: true });
    } catch (error) {
      await db.from('native_welcome_emails').update({ last_error: error instanceof Error ? error.message : 'Delivery failed' }).eq('user_id', user.id);
      return json({ pending: true }, 202);
    }
  } catch (error) {
    console.error('[native-welcome-email]', error instanceof Error ? error.message : 'Unable to send');
    return json({ error: 'Welcome email is pending. Please try again later.' }, 503);
  }
});
