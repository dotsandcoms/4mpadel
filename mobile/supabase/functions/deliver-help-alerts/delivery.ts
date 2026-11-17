import { supportAlertPayload, supportSender, type SupportAlertJob } from './template.ts';
type Client = { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: any; error: unknown }> };
export async function deliverHelpAlerts(client: Client, config: { apiKey: string; sender: string }, send: typeof fetch = fetch) {
  if (!config.apiKey) throw new Error('Email delivery is not configured');
  supportSender(config.sender);
  const call = async (action: string, data: Record<string, unknown> = {}) => {
    const result = await client.rpc('help_alert_jobs', { p_action: action, p_data: data });
    if (result.error) throw new Error('Support delivery state unavailable');
    return result.data;
  };
  const jobs = await call('claim') as SupportAlertJob[];
  if (!Array.isArray(jobs)) throw new Error('Support delivery batch unavailable');
  let accepted = 0, pending = 0;
  const deliver = async (job: SupportAlertJob) => {
    const identity = { id: job.id, leaseId: job.leaseId };
    let reason = 'Email provider did not confirm acceptance';
    try {
      const payload = await call('prepare', { ...identity, payload: job.payload || supportAlertPayload(job, config.sender) });
      if (!payload) return; // A stale lease must never send an email.
      if (JSON.stringify(payload.to) !== '["info@4mpadel.co.za"]') throw new Error('Invalid support recipient');
      const response = await send('https://api.resend.com/emails', { method: 'POST',
        headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `help-support/${job.id}` },
        body: JSON.stringify(payload), signal: AbortSignal.timeout(20000) });
      if (!response.ok) { reason = `Email provider returned HTTP ${response.status}`; throw new Error(reason); }
      const result = await response.json();
      if (typeof result.id !== 'string' || !result.id) throw new Error(reason);
      await call('finish', { ...identity, status: 'sent', providerId: result.id });
      accepted++;
    } catch {
      await call('finish', { ...identity, status: 'retry', error: reason });
      pending++;
    }
  };
  for (let index = 0; index < jobs.length; index += 2) await Promise.all(jobs.slice(index, index + 2).map(deliver));
  return { accepted, pending };
}
