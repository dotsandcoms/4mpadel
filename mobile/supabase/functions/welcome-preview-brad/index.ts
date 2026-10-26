import { welcomePayload } from '../native-welcome-email/template.ts';
// Temporary, service-only preview for the single recipient explicitly requested in this chat.
Deno.serve(async req => {
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!key || req.headers.get('authorization') !== `Bearer ${key}`) return new Response('Unauthorized', { status: 401 });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const sender = Deno.env.get('RESEND_VERIFIED_SENDER') || 'notifications.4mpadel.co.za';
  if (sender === 'onboarding@resend.dev') return new Response('Verified sender required', { status: 503 });
  const result = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json', 'Idempotency-Key': 'requested-welcome-preview-brad-digihive-20260929' },
    body: JSON.stringify(welcomePayload('brad@digihive.co.za', 'Brad', sender)),
    signal: AbortSignal.timeout(20000),
  });
  const data = await result.json();
  return Response.json(result.ok ? { success: true, messageId: data.id } : { success: false, error: data.message || 'Email provider rejected send' }, { status: result.status });
});
