import { readAll } from './playersData.js';
import { clubMemberArguments } from './clubMemberRpc.js';
import { clubMemberAddArguments, normaliseMemberEmail } from './clubMemberAdd.js';
import { exactClubFields } from './liveClubOperations.js';

const memberFields = 'id,club_id,player_id,user_email,role,created_at';
const memberRoles = ['owner', 'admin'];
const emailField = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const literal = value => value.replace(/[\\%_*]/g, '\\$&');
const current = ({ signal, isCurrent }) => {
  signal?.throwIfAborted();
  if (isCurrent?.() === false) throw new Error('The club workspace changed. Reopen this action.');
};

export async function verifyDelegatedClubMembers(options) {
  const { client, clubId, scopeId, userId, signal } = options;
  current(options);
  if (!userId || !clubId || scopeId !== `club:${clubId}`) throw new Error('Open the matching club workspace to manage members.');
  const initial = await client.auth.getUser();
  current(options);
  const user = initial.data?.user;
  if (initial.error || user?.id !== userId || !user.email) throw new Error('Your signed-in account changed. Reopen this club.');
  const [active, authority] = await Promise.all([
    client.rpc('account_is_active'),
    client.rpc('is_club_owner_or_admin', { p_club_id: clubId, p_email: user.email.replace(/[\\%_]/g, '\\$&') }),
  ]);
  current(options);
  if (active.error || active.data !== true || authority.error || authority.data !== true) {
    throw new Error('Current direct club owner or admin access is required.');
  }
  // The hosted helper uses ILIKE. Confirm the actor matched an exact address
  // and a direct owner/admin record in this venue rather than an inherited grant.
  const email = normaliseMemberEmail(user.email);
  const rows = await readAll(() => client.from('club_members').select('id,club_id,user_email,role')
    .eq('club_id', clubId).ilike('user_email', literal(email)).order('id'), signal);
  current(options);
  const direct = rows.filter(row => row.club_id === clubId && normaliseMemberEmail(row.user_email) === email);
  if (direct.length !== 1 || !memberRoles.includes(direct[0].role)) throw new Error('Current direct club owner or admin access is required.');
  const final = await client.auth.getUser();
  current(options);
  if (final.error || final.data?.user?.id !== userId || final.data.user.email !== user.email) {
    throw new Error('Your signed-in account changed. Reopen this club.');
  }
}

async function submitMemberChange({ args, ...options }) {
  const payload = clubMemberArguments(args.p_expected_member, args.p_action, args.p_role, args.p_operation_id);
  if (payload.p_club_id !== args.p_club_id || payload.p_member_id !== args.p_member_id) throw new Error('The reviewed member changed.');
  const scoped = { ...options, clubId: payload.p_club_id };
  await verifyDelegatedClubMembers(scoped);
  if (payload.p_expected_member.role === 'owner') throw new Error('Existing owner changes require a platform super admin.');
  const table = options.client.from('club_members');
  const removed = payload.p_action === 'remove';
  const mutation = removed ? table.delete() : table.update({ role: payload.p_role });
  const { data, error } = await exactClubFields(mutation, payload.p_expected_member).select(memberFields).maybeSingle();
  current(scoped);
  if (error || data?.id !== payload.p_member_id || data?.club_id !== payload.p_club_id || (!removed && data.role !== payload.p_role)) {
    throw new Error('The reviewed member changed or the update could not be confirmed.');
  }
  return { removed, member_id: data.id, role: data.role };
}

async function findPlayer(options, query, members) {
  const email = normaliseMemberEmail(query);
  if (!emailField.test(email) || email.length > 254) return [];
  await verifyDelegatedClubMembers(options);
  const { client, signal } = options;
  let request = client.from('players').select('id,name,email').ilike('email', literal(email)).limit(2);
  if (signal) request = request.abortSignal(signal);
  const result = await request;
  current(options);
  if (result.error || !Array.isArray(result.data)) throw new Error('The selected player could not be looked up.');
  const rows = result.data.filter(row => normaliseMemberEmail(row.email) === email);
  if (rows.length !== 1 || members.some(member => normaliseMemberEmail(member.user_email) === email)) return [];
  return rows;
}

async function submitMemberAdd({ args, ...options }) {
  const payload = clubMemberAddArguments(args.p_club_id, args.p_expected_player, args.p_role, args.p_operation_id);
  if (payload.p_player_id !== args.p_player_id) throw new Error('The reviewed player changed.');
  const scoped = { ...options, clubId: payload.p_club_id };
  const { client } = scoped;
  await verifyDelegatedClubMembers(scoped);
  const selected = payload.p_expected_player;
  const email = normaliseMemberEmail(selected.email);
  if (!emailField.test(email) || email.length > 254) throw new Error('Choose a player with a valid email address.');
  const result = await client.from('players').select('id,name,email').eq('id', selected.id).maybeSingle();
  current(scoped);
  if (result.error || result.data?.id !== selected.id || result.data?.name !== selected.name || normaliseMemberEmail(result.data?.email) !== email) {
    throw new Error('The selected player is no longer visible or changed after review.');
  }
  const matches = await readAll(() => client.from('club_members').select('id,club_id,user_email')
    .eq('club_id', scoped.clubId).ilike('user_email', literal(email)).order('id'));
  if (matches.some(row => row.club_id === scoped.clubId && normaliseMemberEmail(row.user_email) === email)) {
    throw new Error('This account already has a membership. Review the existing member.');
  }
  await verifyDelegatedClubMembers(scoped);
  const { data, error } = await client.from('club_members').insert({
    club_id: scoped.clubId, player_id: selected.id, user_email: email, role: payload.p_role,
  }).select(memberFields).maybeSingle();
  current(scoped);
  if (error || data?.club_id !== scoped.clubId || data?.player_id !== selected.id || data?.user_email !== email || data?.role !== payload.p_role) {
    throw new Error('The member addition could not be confirmed.');
  }
  return { member: { ...data, players: { name: selected.name } }, notification: 'platform_only' };
}

export const delegatedClubMemberApi = { enabled: () => true, live: true, protectOwners: true, submit: submitMemberChange };
export const delegatedClubMemberAddApi = {
  enabled: () => true, live: true, exactEmail: true, submit: submitMemberAdd,
  search: ({ query, members = [], ...options }) => findPlayer(options, query, members),
};
