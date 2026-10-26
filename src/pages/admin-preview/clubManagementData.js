import { canReadClubDirectory } from './clubsData.js';
import { readAll } from './playersData.js';

// These are read models only. Decisions use the separately reviewed atomic RPC,
// never client-side membership upserts or direct claim updates.
export async function loadClubManagement(client, session, permissions, scopeId, clubId, signal) {
  if (!canReadClubDirectory(session, permissions, scopeId)) throw new Error('Platform Clubs access is required.');
  if (typeof clubId !== 'string' || !clubId) throw new Error('Select a club first.');
  const [members, claims] = await Promise.all([
    readAll(() => client.from('club_members').select('id,club_id,player_id,user_email,role,created_at,players!club_members_player_id_fkey(name)').eq('club_id', clubId).order('id'), signal),
    readAll(() => client.from('club_claim_requests').select('id,club_id,full_name,requester_email,requester_player_id,primary_role,status,created_at,reviewed_at,rejection_notes').eq('club_id', clubId).order('id'), signal),
  ]);
  return { members, claims };
}

export function clubClaimDecisionArguments(claim, decision, notes = '') {
  if (!claim?.id || claim.status !== 'pending') throw new Error('Only a pending claim can be reviewed.');
  if (!['approved', 'rejected'].includes(decision)) throw new Error('Choose approval or rejection.');
  if (typeof notes !== 'string' || notes.trim().length > 2000) throw new Error('Feedback must be text of at most 2000 characters.');
  const feedback = notes.trim();
  if (decision === 'rejected' && !feedback) throw new Error('Rejection feedback is required.');
  if (decision === 'approved' && feedback) throw new Error('Approval cannot include rejection feedback.');
  return { p_claim_id: claim.id, p_decision: decision, p_rejection_notes: feedback || null };
}
