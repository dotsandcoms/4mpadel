// Staging simulation only. Intentionally has no provider client or fetch path.
// Real delivery requires a separately reviewed activation, not an environment typo.
export async function simulateClubNotification({ client, kind, render }) {
  if (!['claim', 'application'].includes(kind)) throw new Error('Invalid notification kind.');
  const { data: job, error } = await client.rpc('preview_claim_club_notification', {
    p_kind: kind, p_lease_seconds: 120, p_synthetic_only: true,
  });
  if (error) throw new Error('Could not reserve a notification.');
  if (!job) return { status: 'empty' };
  if (!job.id || !job.attempt_token) throw new Error('Invalid reserved notification; reconcile the lease.');
  let outcome = 'simulated', reason = null;
  try {
    const templates = kind === 'claim' ? ['club_claim_approved', 'club_claim_rejected'] : ['club_approved', 'club_rejected'];
    if (typeof job.recipient !== 'string' || !/^[^\s@]+@example\.invalid$/i.test(job.recipient)
      || !templates.includes(job.template)) throw new Error('Notification is not eligible for synthetic simulation.');
    const email = render(job.template, job.payload);
    if (!email?.subject || !email?.html) throw new Error('Notification could not be rendered.');
    // Rendering is deliberately the last step: no request is made to send-email,
    // whose sandbox mode can redirect to a real mailbox.
  } catch {
    outcome = 'failed'; reason = 'Synthetic notification validation or rendering failed; no provider was called.';
  }
  const { data: result, error: finishError } = await client.rpc('preview_finish_club_notification', {
    p_kind: kind, p_id: job.id, p_attempt_token: job.attempt_token,
    p_outcome: outcome, p_error: reason,
  });
  if (finishError || !result) throw new Error('Notification result was not recorded. Reconcile this attempt; do not resend.');
  return { id: job.id, status: result.delivery_status };
}

export function allowClubNotificationSimulation({ url, mode, authorization, serviceKey }) {
  if (!serviceKey || authorization !== `Bearer ${serviceKey}`) return 401;
  if (url !== 'https://cefmzkwabdqqoagxhekc.supabase.co' || mode !== 'simulate') return 403;
  return null;
}
