import { verifyPlatformClubAction } from './liveClubOperations.js';
import { readAll } from './playersData.js';

export const matchLabels = { conflict: 'Conflict', matched: 'Weak match', low_confidence: 'Uncertain', no_match: 'No match' };
export const isGoogleLinked = club => Boolean(club?.google_place_id?.trim() || club?.google_maps_url?.trim());

export async function loadClubGoogleMatches({ client, scopeId, userId, signal }) {
  const isCurrent = () => !signal?.aborted;
  await verifyPlatformClubAction(client, scopeId, userId, isCurrent);
  const rows = await readAll(() => client.from('club_google_matches')
    .select('id,club_id,review_status,match_status,google_place_id,google_name,google_address,confidence,conflict_note,clubs(id,name,city,google_place_id,google_maps_url)')
    .order('created_at').order('id'), signal);
  await verifyPlatformClubAction(client, scopeId, userId, isCurrent);
  return rows.filter(row => row.id && row.club_id && row.club_id === row.clubs?.id);
}

export async function reviewClubGoogleMatch({ client, scopeId, userId, row, decision, review, candidate, signal }) {
  if (!row?.id || !row.club_id || row.clubs?.id !== row.club_id || !['apply','dismiss'].includes(decision)) {
    throw new Error('Choose a recorded club match.');
  }
  if (review && (review.club_id !== row.club_id || review.match_id !== row.id || review.decision !== decision || !review.token)) {
    throw new Error('Open a fresh review for the selected club match.');
  }
  await verifyPlatformClubAction(client, scopeId, userId, () => !signal?.aborted);
  const args = {
    p_action: review ? decision : `review-${decision}`,
    p_club_id: row.club_id,
    p_match_id: row.id,
    p_expected: review?.token || null,
    ...(candidate ? {p_candidate:candidate} : {}),
  };
  let request = client.rpc(candidate ? 'review_manual_club_google_match' : 'review_club_google_match', args);
  if (signal && request.abortSignal) request = request.abortSignal(signal);
  const { data, error } = await request;
  signal?.throwIfAborted();
  if (['PGRST202', '42883'].includes(error?.code)) throw new Error('Reviewed Google match changes require the updated database service.');
  if (error) throw new Error(error.message || 'The Google match action could not be confirmed.');
  if (data?.club_id !== row.club_id || data?.match_id !== row.id || data.decision !== decision || (!review && !data.token)) {
    throw new Error('The Google match confirmation did not match the selected club.');
  }
  return data;
}
