import { verifyClubCreationAccess } from './clubCreation.js';
import { CLUB_MEMBER_ROLES, CLUB_MEMBER_STAGING_URL } from './clubMemberRpc.js';
const environment = () => ({ enable: import.meta.env?.VITE_ENABLE_CLUB_MEMBER_ADD });
export const isClubMemberAddEnabled = (client, config = environment()) => config?.enable === 'staging' && client?.supabaseUrl === CLUB_MEMBER_STAGING_URL;
export const normaliseMemberEmail = value => String(value || '').trim().toLowerCase();
// Quote PostgREST grammar and escape LIKE wildcards, so input is always literal.
export function memberSearchFilter(query) {
  const literal = query.trim().replace(/[\\%_*]/g, '\\$&');
  const quoted = JSON.stringify(`%${literal}%`);
  return `name.ilike.${quoted},email.ilike.${quoted}`;
}
export async function searchClubMemberPlayers({ client, scopeId, userId, query, members = [], signal }) {
  if (query.trim().length < 2) return [];
  if (!userId) throw new Error('Sign in before searching players.');
  await verifyClubCreationAccess(client, scopeId, userId);
  if (signal?.aborted) return [];
  const { data, error } = await client.from('players').select('id,name,email,image_url').or(memberSearchFilter(query)).not('email', 'is', null).limit(8).abortSignal(signal);
  if (signal?.aborted) return [];
  if (error) throw new Error(error.message || 'Player search failed.');
  const existing = new Set(members.map(member => normaliseMemberEmail(member.user_email)));
  return (data || []).filter(player => normaliseMemberEmail(player.email) && !existing.has(normaliseMemberEmail(player.email)));
}
export function clubMemberAddArguments(clubId, player, role, operationId) {
  if (!clubId || !operationId || !player?.id || !Object.hasOwn(player, 'name') || !normaliseMemberEmail(player.email)) throw new Error('Choose an existing player with an email address.');
  if (!CLUB_MEMBER_ROLES.includes(role)) throw new Error('Choose a valid member role.');
  return { p_operation_id: operationId, p_club_id: clubId, p_player_id: player.id, p_role: role, p_expected_player: structuredClone({ id: player.id, name: player.name, email: player.email }) };
}
export async function submitClubMemberAdd({ client, scopeId, userId, args, isCurrent = () => true, config }) {
  const gate = () => { if (!isClubMemberAddEnabled(client, config)) throw new Error('Adding members is enabled only on the verified staging project.'); };
  gate();
  if (!userId) throw new Error('Sign in and reopen the club.');
  const payload = clubMemberAddArguments(args.p_club_id, args.p_expected_player, args.p_role, args.p_operation_id);
  if (payload.p_player_id !== args.p_player_id) throw new Error('The reviewed player changed.');
  await verifyClubCreationAccess(client, scopeId, userId);
  gate();
  if (!isCurrent()) throw new Error('The reviewed club context changed.');
  const { data, error } = await client.rpc('preview_add_club_member', payload);
  if (error) throw new Error(error.message || 'Member addition failed.');
  if (!data || data.operation_id !== payload.p_operation_id || data.club_id !== payload.p_club_id || !data.member_id || data.member?.id !== data.member_id || data.member.club_id !== payload.p_club_id || String(data.member.player_id) !== String(payload.p_player_id) || data.member.role !== payload.p_role || normaliseMemberEmail(data.member.user_email) !== normaliseMemberEmail(payload.p_expected_player.email) || data.notification !== 'pending') throw new Error('Unrecognised member response. Reload members before retrying.');
  return { ...data, member: { ...data.member, players: { name: payload.p_expected_player.name } } };
}
export const clubMemberAddApi = { enabled: isClubMemberAddEnabled, search: searchClubMemberPlayers, submit: submitClubMemberAdd };
