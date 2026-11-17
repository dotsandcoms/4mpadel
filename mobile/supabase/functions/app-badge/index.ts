import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { appBadgeState } from '../_shared/app-badge.ts';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const client = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: request.headers.get('Authorization') || '' } } });
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user?.email || !user.email_confirmed_at || user.is_anonymous) return json({ error: 'Sign in again.' }, 401);
    // The own-only RPC also checks the live auth.sessions row, email and bans.
    const unread = await client.rpc('own_app_badge_unread');
    if (unread.error) return json({ error: 'Badge count unavailable.' }, 401);
    const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    return json(await appBadgeState(service, user.email, Number(unread.data)));
  } catch { return json({ error: 'Badge count unavailable.' }, 503); }
});
