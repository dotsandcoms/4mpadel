import { createClient } from 'npm:@supabase/supabase-js@2.95.3';
import { deliverHelpAlerts } from './delivery.ts';
import { supportSender } from './template.ts';
Deno.serve(async request => {
  const secret = Deno.env.get('PUSH_WORKER_SECRET');
  if (!secret || request.headers.get('Authorization') !== `Bearer ${secret}`) return new Response('Unauthorized', { status: 401 });
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  try {
    const config = { apiKey: Deno.env.get('RESEND_API_KEY') || '', sender: Deno.env.get('RESEND_VERIFIED_SENDER') || 'notifications.4mpadel.co.za' };
    if (new URL(request.url).searchParams.get('health') === '1') {
      if (!config.apiKey) throw new Error('Email delivery is not configured');
      supportSender(config.sender);
      return Response.json({ ready: true });
    }
    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const result = await deliverHelpAlerts(client, config);
    return Response.json(result);
  } catch {
    console.warn('Support email delivery is pending; inspect the private delivery queue');
    return Response.json({ error: 'Support email delivery is pending' }, { status: 503 });
  }
});
