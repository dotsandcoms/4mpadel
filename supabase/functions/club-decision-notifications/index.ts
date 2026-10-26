import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { simulateClubNotification, allowClubNotificationSimulation } from '../_shared/clubNotificationWorker.js';
import { renderClubDecisionEmail } from '../_shared/clubDecisionEmail.js';

serve(async (req: Request) => {
  const headers = { 'Content-Type': 'application/json' };
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (req.method !== 'POST') return reply({ error: 'POST required' }, 405);
  const url = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  // Separate worker credential: never accept an ordinary signed-in browser as
  // the notification worker. Database service credentials remain server-side.
  const gate = allowClubNotificationSimulation({ url,
    serviceKey: Deno.env.get('CLUB_NOTIFICATION_WORKER_TOKEN') || '',
    mode: Deno.env.get('CLUB_NOTIFICATION_MODE'),
    authorization: req.headers.get('X-Club-Worker-Token') ? `Bearer ${req.headers.get('X-Club-Worker-Token')}` : null });
  if (gate) return reply({ error: 'Staging simulation is disabled or not authorised.' }, gate);
  try {
    const { kind } = await req.json();
    if (!['claim', 'application'].includes(kind)) return reply({ error: 'Choose claim or application.' }, 400);
    const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    return reply(await simulateClubNotification({ client, kind, render: renderClubDecisionEmail }));
  } catch {
    return reply({ error: 'Simulation could not complete. Inspect the recorded attempt before retrying.' }, 500);
  }
});
