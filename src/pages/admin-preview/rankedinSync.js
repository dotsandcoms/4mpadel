import { extractRankedinId } from '../../utils/rankedinLink.js';

export const eventRankedinId = event => extractRankedinId(event?.rankedin_id) || extractRankedinId(event?.rankedin_url);

// Keep the existing edge function as the authority for mapping, eligibility and pushes.
export async function runRankedinSync({ client, event }) {
  const rankedinId = eventRankedinId(event);
  if (!event?.id || !event.is_manual || !rankedinId) throw new Error('Link a RankedIn tournament to this 4M-hosted event first.');
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth?.user) throw new Error('Sign in before syncing to RankedIn.');
  const { data: fresh, error: readError } = await client.from('calendar').select('id,is_manual,rankedin_id,rankedin_url').eq('id', event.id).maybeSingle();
  if (readError) throw readError;
  if (!fresh?.is_manual || eventRankedinId(fresh) !== rankedinId) throw new Error('The event link has changed. Close and refresh before syncing.');
  const { data, error } = await client.functions.invoke('sync-to-rankedin', { body: { eventId: event.id, rankedinId } });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || 'RankedIn sync did not return a confirmed result.');
  return data;
}

export function rankedinSyncSummary(result) {
  const write = result.writePush || {}, details = result.detailsPush || {};
  const missing = result.mapping?.unmatchedLocal || [];
  const errors = [...(result.error ? [result.error] : []), ...(write.errors || []), ...(details.errors || [])];
  const unconfigured = write.status === 'not_configured' || details.status === 'not_configured';
  return {
    mapped: result.mapping?.mapped?.length || 0,
    pushed: write.pushed || 0,
    updated: details.updated || [],
    skipped: write.skipped || [], missing, errors,
    needsReview: errors.length > 0 || missing.length > 0 || unconfigured || ['error', 'partial'].includes(write.status) || ['error', 'partial'].includes(details.status),
    messages: [write.message, details.message].filter((value, index, values) => value && values.indexOf(value) === index),
    nextSteps: result.nextSteps || [],
  };
}
