import { verifyPlatformClubAction } from './liveClubOperations.js';

async function callClubLifecycle({ client, session, scopeId, sourceId, targetId, action, review, requestId, signal, isCurrent }) {
  const current = () => !signal?.aborted && isCurrent?.() !== false;
  await verifyPlatformClubAction(client, scopeId, session?.user?.id, current);
  let request = client.rpc('manage_reviewed_club', {
    p_action: action, p_source: sourceId, p_target: targetId ?? null,
    p_expected: review ?? null, p_request_id: requestId ?? null,
  });
  if (signal && request.abortSignal) request = request.abortSignal(signal);
  const { data, error } = await request;
  if (!current()) throw new DOMException('Cancelled', 'AbortError');
  if (error) {
    if (['PGRST202', '42883'].includes(error.code)) throw new Error('The club review service is unavailable.');
    throw error;
  }
  return data;
}

export async function reviewClubLifecycle(options) {
  const result = await callClubLifecycle({ ...options, action: options.targetId ? 'review-merge' : 'review-delete' });
  if (result?.source?.id !== options.sourceId || (options.targetId ? result?.target?.id !== options.targetId : result.target !== null)) {
    throw new Error('The exact club records could not be verified.');
  }
  return result;
}

export async function saveClubLifecycle(options) {
  const { review, confirmation, requestId } = options;
  if (!requestId || !review?.source?.name || confirmation !== review.source.name) throw new Error('Confirm the exact source club name.');
  const { source, target } = review;
  if (!target && source.players) throw new Error('Merge this club to preserve its linked players.');
  const action = target ? 'merge' : 'delete';
  const result = await callClubLifecycle({ ...options, action, sourceId: source.id, targetId: target?.id });
  if (result?.action !== (target ? 'merged' : 'deleted') || result.source_id !== source.id || (target && result.target_id !== target.id)) {
    throw new Error('The club operation could not be confirmed.');
  }
  return result;
}
