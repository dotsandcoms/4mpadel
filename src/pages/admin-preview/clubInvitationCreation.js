import { verifyClubCreationAccess } from './clubCreation.js';
import { normalizeClubInvitationEmail, loadClubInvitationProfile } from './clubInvitations.js';

export const CLUB_INVITATION_STAGING_URL = 'https://cefmzkwabdqqoagxhekc.supabase.co';
const environment = () => ({ enable: import.meta.env?.VITE_ENABLE_CLUB_INVITATIONS });
export const isClubInvitationCreationEnabled = (client, config = environment()) => config?.enable === 'staging' && client?.supabaseUrl === CLUB_INVITATION_STAGING_URL;
const cancelled = signal => { if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError'); };
const identity = (clubId, userId) => { if (!clubId || !userId) throw new Error('Select a club and sign in before reviewing an invitation.'); };
export async function prepareClubInvitationCreation({ client, scopeId, userId, clubId, email, signal }) {
  identity(clubId, userId); cancelled(signal);
  const normalizedEmail = normalizeClubInvitationEmail(email);
  await verifyClubCreationAccess(client, scopeId, userId); cancelled(signal);
  let clubQuery = client.from('clubs').select('id,name').eq('id', clubId);
  if (signal) clubQuery = clubQuery.abortSignal(signal);
  const { data: club, error } = await clubQuery.single();
  cancelled(signal);
  if (error || !club || club.id !== clubId || !Object.hasOwn(club, 'name')) throw new Error('Could not verify the club. Reload before reviewing.');
  const player = await loadClubInvitationProfile(client, normalizedEmail, signal);
  cancelled(signal);
  if (player && (player.id == null || !Object.hasOwn(player, 'name'))) throw new Error('Could not verify the complete player profile.');
  return { clubId, normalizedEmail, expectedClub: { id: club.id, name: club.name }, expectedPlayer: player ? { id: player.id, name: player.name, email: player.email } : null, existingPlayer: Boolean(player), profileSetupRequired: !player };
}
export function clubInvitationCreationArguments(review, operationId) {
  if (!operationId || !review?.clubId || review.expectedClub?.id !== review.clubId || !Object.hasOwn(review.expectedClub, 'name')) throw new Error('Review the club before creating an invitation.');
  const email = normalizeClubInvitationEmail(review.normalizedEmail), player = review.expectedPlayer;
  if (player !== null && (!player || player.id == null || !Object.hasOwn(player, 'name') || String(player.email || '').trim().toLowerCase() !== email)) throw new Error('Review the exact recipient profile before inviting.');
  return { p_operation_id: operationId, p_club_id: review.clubId, p_email: email,
    p_expected_club: structuredClone({ id: review.expectedClub.id, name: review.expectedClub.name }),
    p_expected_player: player === null ? null : structuredClone({ id: player.id, name: player.name, email: player.email }) };
}
export async function submitClubInvitationCreation({ client, scopeId, userId, args, isCurrent = () => true, config }) {
  const gate = () => { if (!isClubInvitationCreationEnabled(client, config)) throw new Error('Invitation creation is enabled only on the verified staging project.'); };
  gate(); identity(args?.p_club_id, userId);
  const payload = clubInvitationCreationArguments({ clubId: args.p_club_id, normalizedEmail: args.p_email, expectedClub: args.p_expected_club, expectedPlayer: args.p_expected_player }, args.p_operation_id);
  await verifyClubCreationAccess(client, scopeId, userId); gate();
  if (!isCurrent()) throw new Error('The reviewed invitation context changed. Review again.');
  const { data, error } = await client.rpc('preview_create_club_invitation', payload);
  if (error) throw new Error(error.message || 'Invitation could not be created.');
  const setup = payload.p_expected_player === null;
  if (!data || data.operation_id !== payload.p_operation_id || data.club_id !== payload.p_club_id || typeof data.invite_id !== 'string' || !data.invite_id || data.email !== payload.p_email || typeof data.created_at !== 'string' || !Number.isFinite(Date.parse(data.created_at)) || data.status !== 'pending' || data.notification_status !== 'pending' || data.profile_setup_required !== setup || data.profile_setup_status !== (setup ? 'unconnected' : 'not_required') || typeof data.already_applied !== 'boolean') throw new Error('Unrecognised invitation response. Reload before retrying.');
  // Never pass through server extras (especially bearer tokens or claim URLs).
  return { operation_id: data.operation_id, club_id: data.club_id, invite_id: data.invite_id, email: data.email, created_at: data.created_at, status: data.status, notification_status: data.notification_status, profile_setup_required: setup, profile_setup_status: data.profile_setup_status, already_applied: data.already_applied };
}
export const clubInvitationCreationApi = { enabled: isClubInvitationCreationEnabled, prepare: prepareClubInvitationCreation, submit: submitClubInvitationCreation };
