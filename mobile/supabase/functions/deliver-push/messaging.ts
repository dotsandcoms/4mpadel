/** Batched, leased chat delivery. No per-device database HTTP round trips. */
type Client = { rpc: (name: string, data?: Record<string, unknown>) => PromiseLike<{ data: any; error: unknown }> };
type Context = { skip?: boolean; token: string; title: string; body: string; path: string; badge?: number };
type Job = { id: string; lease: string; ticket: string | null; attempts: number; context?: Context };
type Finish = { id: string; lease: string; state: string; ticket?: string; unregistered?: boolean };
export async function deliverMessagingPush(client: Client, expo: (endpoint: string, body: unknown) => Promise<any>, badgeForToken?: (token: string) => Promise<number>) {
  const rpc = async <T>(name: string, data: Record<string, unknown> = {}): Promise<T> => {
    const result = await client.rpc(name, data);
    if (result.error) throw new Error('Messaging delivery operation failed');
    return result.data as T;
  };
  const deadline = Date.now() + 20000;
  let processed = 0, full = false;
  do {
    const batch = await rpc<{ claimed: number; jobs: Job[]; deferred?: boolean }>('messaging_push_batch');
    if (batch.deferred) { full = true; await new Promise(resolve => setTimeout(resolve, 1000)); continue; }
    full = batch.claimed >= 200;
    if (!batch.claimed) break;
    const updates: Finish[] = [];
    const finish = (job: Job, state: string, extra: Partial<Finish> = {}) => updates.push({ id: job.id, lease: job.lease, state, ...extra });
    const receipts = batch.jobs.filter(job => job.ticket);
    if (receipts.length) {
      try {
        const result = await expo('getReceipts', { ids: receipts.map(job => job.ticket) });
        for (const job of receipts) {
          const receipt = result?.[job.ticket!];
          if (!receipt) finish(job, job.attempts >= 12 ? 'failed' : 'accepted');
          else finish(job, receipt.status === 'ok' ? 'sent' : 'failed', { unregistered: receipt.details?.error === 'DeviceNotRegistered' });
        }
      } catch { for (const job of receipts) finish(job, job.attempts >= 12 ? 'failed' : 'accepted'); }
    }
    const ready = batch.jobs.filter(job => !job.ticket && job.context && !job.context.skip);
    for (let offset = 0; offset < ready.length; offset += 100) {
      const chunk = ready.slice(offset, offset + 100);
      try {
        const payloads = await Promise.all(chunk.map(async job => {
          const context = job.context!;
          const badge = context.badge ?? await badgeForToken?.(context.token).catch(() => undefined);
          return { to: context.token, title: context.title, body: context.body, sound: 'default', channelId: 'default',
            ...(badge !== undefined ? { badge } : {}), data: { type: 'chat_message', path: context.path } };
        }));
        const result = await expo('send', payloads);
        const tickets = Array.isArray(result) ? result : chunk.length === 1 ? [result] : [];
        for (let i = 0; i < chunk.length; i++) {
          const ticket = tickets[i], job = chunk[i];
          if (ticket?.status === 'ok' && ticket.id) finish(job, 'accepted', { ticket: ticket.id });
          else if (!ticket || ticket?.details?.error === 'MessageRateExceeded') finish(job, job.attempts >= 6 ? 'failed' : 'pending');
          else finish(job, 'failed', { unregistered: ticket?.details?.error === 'DeviceNotRegistered' });
        }
      } catch { for (const job of chunk) finish(job, job.attempts >= 6 ? 'failed' : 'pending'); }
    }
    if (updates.length) await rpc('messaging_push_finish', { p_items: updates });
    processed += batch.claimed;
  } while (full && Date.now() < deadline);
  if (full) await rpc('messaging_push_continue');
  return processed;
}
