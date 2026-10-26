import { verifyClubCreationAccess } from './clubCreation.js';

export const CLUB_MEMBER_STAGING_URL = 'https://cefmzkwabdqqoagxhekc.supabase.co';
export const CLUB_MEMBER_ROLES = ['owner', 'admin', 'staff'];
const environment = () => ({ enable: import.meta.env?.VITE_ENABLE_CLUB_MEMBERS });
export function isClubMemberWriteEnabled(client, config = environment()) {
  return config?.enable === 'staging' && client?.supabaseUrl === CLUB_MEMBER_STAGING_URL;
}
export function clubMemberArguments(record, action, role, operationId) {
  const keys = ['id', 'club_id', 'player_id', 'user_email', 'role', 'created_at'];
  if (!record?.id || !record.club_id || keys.some(key => !Object.hasOwn(record, key))) throw new Error('Reload the complete member record before reviewing.');
  if (!['change_role', 'remove'].includes(action)) throw new Error('Choose a member action.');
  if (action === 'change_role' && (!CLUB_MEMBER_ROLES.includes(role) || role === record.role)) throw new Error('Choose a different valid role.');
  if (!operationId) throw new Error('A unique reviewed operation is required.');
  return { p_operation_id: operationId, p_club_id: record.club_id, p_member_id: record.id, p_action: action, p_role: action === 'remove' ? null : role,
    p_expected_member: structuredClone(Object.fromEntries(keys.map(key => [key, record[key]]))) };
}
export async function submitClubMemberChange({ client, scopeId, userId, args, isCurrent = () => true, config }) {
  const gated = () => { if (!isClubMemberWriteEnabled(client, config)) throw new Error('Member writes are enabled only on the verified staging project.'); };
  gated();
  if (!userId) throw new Error('Sign in and reopen the member before continuing.');
  // Revalidate the immutable reviewed payload before authorization and transport.
  const verified = clubMemberArguments(args.p_expected_member, args.p_action, args.p_role, args.p_operation_id);
  if (verified.p_member_id !== args.p_member_id || verified.p_club_id !== args.p_club_id) throw new Error('The reviewed member context changed.');
  await verifyClubCreationAccess(client, scopeId, userId);
  gated();
  if (!isCurrent()) throw new Error('The reviewed member context changed. Reopen the member.');
  const { data, error } = await client.rpc('preview_manage_club_member', verified);
  if (error) throw new Error(error.message || 'The member change could not be confirmed.');
  if (!data || data.operation_id !== verified.p_operation_id || data.member_id !== verified.p_member_id || data.club_id !== verified.p_club_id || data.action !== verified.p_action || data.removed !== (verified.p_action === 'remove') || (verified.p_action === 'change_role' && data.role !== verified.p_role)) throw new Error('Unrecognised member response. Reload before retrying.');
  return data;
}
export const clubMemberApi = { enabled: isClubMemberWriteEnabled, submit: submitClubMemberChange };
