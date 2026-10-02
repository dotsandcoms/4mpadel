import { createClient } from 'npm:@supabase/supabase-js@2';
import { deliveryDecision, retryDelay } from './policy.ts';

const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
async function checked<T>(request: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await request;
  if (error) throw error;
  return data;
}
async function expo(endpoint: string, body: unknown) {
  const token = Deno.env.get('EXPO_ACCESS_TOKEN');
  const response = await fetch(`https://exp.host/--/api/v2/push/${endpoint}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Expo HTTP ${response.status}`);
  const result = await response.json();
  if (result.errors?.length || !result.data) throw new Error('Expo did not return a valid result');
  return result.data;
}

Deno.serve(async request => {
  // Dedicated scheduler secret; never accept a player's JWT or a client-supplied recipient.
  const secret = Deno.env.get('PUSH_WORKER_SECRET');
  if (!secret || request.headers.get('Authorization') !== `Bearer ${secret}`) return new Response('Unauthorized', { status: 401 });
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  try {
    await checked(client.rpc('refresh_tournament_notifications'));
    const jobs = await checked(client.rpc('claim_push_deliveries', { p_recipient_emails: null }));
    let processed = 0;
    const processJob = async (job: NonNullable<typeof jobs>[number]) => {
      const finish = (values: Record<string, unknown>) => checked(client.from('push_deliveries').update(values).eq('id', job.id).eq('lease_id', job.lease_id));
      try {
        const outbox = await checked(client.from('push_outbox').select('*').eq('id', job.outbox_id).single());
        const token = await checked(client.from('player_push_tokens').select('id,email,token,token_kind').eq('id', job.token_id).maybeSingle());
        if (job.ticket_id) {
          const receipts = await expo('getReceipts', { ids: [job.ticket_id] });
          const receipt = receipts[job.ticket_id];
          if (!receipt) {
            await finish(job.attempts >= 12 ? { status: 'failed', error: 'Receipt unavailable' } : { available_at: new Date(Date.now() + 15 * 60000).toISOString() });
          } else {
            await finish({ status: receipt.status === 'ok' ? 'sent' : 'failed', error: receipt.status === 'ok' ? null : receipt.details?.error || 'Provider rejected notification' });
            if (receipt.details?.error === 'DeviceNotRegistered' && token) await checked(client.from('player_push_tokens').delete().eq('id', token.id).eq('token', token.token).eq('email', token.email));
          }
          processed++; return;
        }
        // Stored player email casing may differ; use a security-definer exact-normalized lookup.
        const context = await checked(client.rpc('push_delivery_context', { p_outbox: outbox.id }));
        if (!context || typeof context !== 'object') throw new Error('Delivery context unavailable');
        if (context.skip) { await finish({ status: 'skipped', error: context.skip }); return; }
        if (context?.defer_until && Date.parse(context.defer_until) > Date.now()) {
          await finish({ status: 'pending', attempts: Math.max(0, job.attempts - 1), available_at: context.defer_until });
          return;
        }
        const prefs = context?.preferences ?? {};
        const decision = deliveryDecision(outbox, token, prefs ?? {});
        if (decision) { await finish({ status: 'skipped', error: decision }); processed++; return; }
        const ticket = await expo('send', {
          to: token!.token, title: outbox.title, body: outbox.body, sound: 'default', channelId: 'default',
          data: { type: outbox.type, path: outbox.path || '/calendar', notificationId: outbox.id },
        });
        if (ticket.status === 'ok' && ticket.id) {
          await finish({ status: 'accepted', ticket_id: ticket.id, attempts: 0, error: null, available_at: new Date(Date.now() + 15 * 60000).toISOString() });
        } else {
          const code = ticket.details?.error || 'Invalid Expo ticket';
          if (code === 'MessageRateExceeded') throw new Error(code);
          await finish({ status: 'failed', error: code });
          if (code === 'DeviceNotRegistered') await checked(client.from('player_push_tokens').delete().eq('id', token!.id).eq('token', token!.token).eq('email', token!.email));
        }
        processed++;
      } catch (error) {
        // Do not log payloads, emails, tokens or secrets.
        const message = error instanceof Error ? error.message : 'Delivery operation failed';
        await finish({ status: job.attempts >= 6 ? 'failed' : job.ticket_id ? 'accepted' : 'pending', error: message, available_at: new Date(Date.now() + retryDelay(job.attempts)).toISOString() });
      }
    };
    // Bound concurrency and finish a claimed batch before its lease expires.
    for (let i = 0; i < (jobs?.length ?? 0); i += 5) {
      await Promise.all(jobs!.slice(i, i + 5).map(processJob));
    }
    return Response.json({ processed });
  } catch {
    return Response.json({ error: 'Push worker failed; inspect delivery state before retrying.' }, { status: 500 });
  }
});
