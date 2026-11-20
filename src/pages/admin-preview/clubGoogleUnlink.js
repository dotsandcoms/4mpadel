import { verifyPlatformClubAction } from './liveClubOperations.js';

const placeIdPattern = /^[A-Za-z0-9_-]{1,255}$/;

export async function reviewClubGoogleUnlink({ client, scopeId, userId, row, decision, review, placeId, signal }) {
  if (!row?.id || !row.club_id || row.clubs?.id !== row.club_id || !['delist','conflict'].includes(decision)
    || (placeId != null && (decision !== 'conflict' || !placeIdPattern.test(placeId)))) {
    throw new Error('Choose a recorded club and Google listing to review.');
  }
  if (review && (review.club_id !== row.club_id || review.match_id !== row.id || review.decision !== decision
    || !review.target?.id || !review.token || (decision === 'delist' && review.target.id !== row.club_id)
    || (decision === 'conflict' && (review.target.id === row.club_id || review.place_id !== (placeId ?? row.google_place_id))))) {
    throw new Error('Open a fresh review for the selected Google link.');
  }

  await verifyPlatformClubAction(client, scopeId, userId, () => !signal?.aborted);
  let request = client.rpc('review_club_google_unlink', {
    p_action: review ? decision : `review-${decision}`,
    p_club_id: row.club_id,
    p_match_id: row.id,
    p_expected: review?.token ?? null,
    p_target_club_id: review?.target.id ?? null,
    p_place_id: placeId ?? null,
  });
  if (signal && request.abortSignal) request = request.abortSignal(signal);
  const { data, error } = await request;
  signal?.throwIfAborted();
  if (['PGRST202','42883'].includes(error?.code)) throw new Error('Reviewed Google unlinking requires the updated database service.');
  if (error) throw new Error(error.message || 'The Google unlink could not be confirmed.');
  if (data?.club_id !== row.club_id || data?.match_id !== row.id || data?.source?.id !== row.club_id || data.decision !== decision
    || (decision === 'conflict' && data.place_id !== (placeId ?? row.google_place_id))) {
    throw new Error('The Google review did not match the selected club and listing.');
  }
  if (!review && decision === 'conflict' && data.status === 'available') return data;
  if (!data.target?.id || (decision === 'delist' ? data.target.id !== row.club_id : data.target.id === row.club_id)
    || (review ? data.status !== 'unlinked' || data.target.id !== review.target.id
      : data.status !== 'review' || !data.token || !data.patch || !data.before)) {
    throw new Error('The Google review did not match the selected link.');
  }
  return data;
}
