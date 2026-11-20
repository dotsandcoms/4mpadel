import { verifyClubCreationAccess } from './clubCreation.js';
import { applicationDecisionArguments, claimDecisionArguments } from './clubDecisionRpc.js';
import { clubMemberArguments } from './clubMemberRpc.js';
import { clubMemberAddArguments, normaliseMemberEmail, searchClubMemberPlayers } from './clubMemberAdd.js';
import { clubInvitationCreationArguments, prepareClubInvitationCreation } from './clubInvitationCreation.js';
import { CLUB_INVITATION_FIELDS, normalizeClubInvitationEmail } from './clubInvitations.js';
import { entityEqual } from './organisationFederationData.js';
import { readAll } from './playersData.js';

const applicationFields = 'id,name,status,contact_email,contacts,created_by,updated_at';
const claimFields = 'id,club_id,full_name,requester_email,requester_player_id,primary_role,status,created_at';
const claimReviewFields = `${claimFields},contact_phone,notes,clubs(id,name,status,updated_at)`;
const memberFields = 'id,club_id,player_id,user_email,role,created_at';
const publicSite = 'https://4mpadel.co.za';
const available = () => true;

function requireCurrent(isCurrent) {
  if (isCurrent?.() === false) throw new Error('The workspace changed. Reopen this review.');
}
export async function verifyPlatformClubAction(client, scopeId, userId, isCurrent) {
  if (!userId || scopeId !== 'all') throw new Error('Sign in to the platform Clubs workspace to manage this record.');
  await verifyClubCreationAccess(client, scopeId, userId);
  requireCurrent(isCurrent);
}

export function exactClubFields(query, expected) {
  return Object.entries(expected).reduce((result, [key, value]) => value == null ? result.is(key, null)
    : result.eq(key, typeof value === 'object' ? JSON.stringify(value) : value), query);
}
async function confirmRow(query, message) {
  const { data, error } = await query.maybeSingle();
  if (error || !data) throw new Error(message);
  return data;
}
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
async function clubEmail(client, to, template, variables) {
  try {
    const { data, error } = await client.functions.invoke('send-email', { body: { to, template, variables } });
    return !error && data?.success === true && !data.skipped ? 'submitted' : 'unconfirmed';
  } catch { return 'unconfirmed'; }
}

export function clubApplicantEmail(club) {
  const contacts = Array.isArray(club?.contacts) ? club.contacts : [];
  const raw = club?.contact_email || (contacts.find(contact => contact?.is_primary === true) || contacts[0])?.email;
  return raw ? normalizeClubInvitationEmail(raw) : '';
}
async function exactPlayer(client, id, email) {
  if (id == null) return null;
  const player = await confirmRow(client.from('players').select('id,name,email').eq('id', id), 'The recorded player is no longer available.');
  if (normaliseMemberEmail(player.email) !== email) throw new Error('The recorded player and email no longer match.');
  return player;
}
async function clubMemberByEmail(client, clubId, email) {
  const pattern = '%' + email.replace(/[\\%_]/g, '\\$&').replace(/\*/g, '%') + '%';
  const records = await readAll(() => client.from('club_members').select(memberFields).eq('club_id', clubId).ilike('user_email', pattern).order('id'));
  const exact = records.filter(row => row.club_id === clubId && normaliseMemberEmail(row.user_email) === email);
  if (exact.length > 1) throw new Error('Multiple memberships use the recorded email. Review the existing members first.');
  return exact[0] || null;
}
async function loadDecision({ client, scopeId, userId, kind, clubId, claimId }) {
  await verifyPlatformClubAction(client, scopeId, userId);
  if (kind === 'claim') {
    const row = await confirmRow(client.from('club_claim_requests').select(claimReviewFields)
      .eq('id', claimId).eq('club_id', clubId), 'The club claim is no longer available.');
    if (row.id !== claimId || row.club_id !== clubId || row.clubs?.id !== clubId) throw new Error('Reload the exact club claim before reviewing.');
    claimDecisionArguments(row, 'approved');
    return row;
  }
  const row = await confirmRow(client.from('clubs').select(applicationFields).eq('id', clubId), 'The club application is no longer available.');
  if (row.id !== clubId) throw new Error('Reload the exact club application before reviewing.');
  applicationDecisionArguments(row, 'approved');
  return row;
}

export async function loadPendingClubClaims({ client, scopeId, userId, signal }) {
  const stillOpen = () => !signal?.aborted;
  await verifyPlatformClubAction(client, scopeId, userId, stillOpen);
  const rows = await readAll(() => client.from('club_claim_requests').select(`${claimFields},clubs(id,name,short_name,city,status)`)
    .eq('status', 'pending').order('created_at').order('id'), signal);
  await verifyPlatformClubAction(client, scopeId, userId, stillOpen);
  return rows;
}

async function submitDecision({ client, scopeId, userId, kind, original, args, isCurrent }) {
  await verifyPlatformClubAction(client, scopeId, userId, isCurrent);
  if (!['claim', 'application'].includes(kind)) throw new Error('Choose an application or club claim.');
  const claim = kind === 'claim';
  const club = claim ? original?.clubs : original;
  const clubId = claim ? args.p_expected_club_id : args.p_club_id;
  if (!clubId || club?.id !== clubId || !Object.hasOwn(club, 'updated_at')) throw new Error('Reload the exact club before confirming.');
  const approved = args.p_decision === 'approved';
  const email = claim ? normalizeClubInvitationEmail(original.requester_email) : clubApplicantEmail(original);
  const expectedClub = claim ? { name: club.name, status: club.status } : args.p_expected_application;
  const { data, error } = await client.rpc('admin_reviewed_club_decision', {
    p_kind: kind, p_club_id: clubId, p_decision: args.p_decision,
    p_expected_club: { ...expectedClub, updated_at: club.updated_at },
    p_claim_id: claim ? args.p_claim_id : null, p_expected_claim: claim ? args.p_expected_claim : null,
    p_rejection_notes: args.p_rejection_notes,
  });
  if (error) throw new Error(error.message || 'The decision could not be confirmed.');

  const status = approved && !claim ? 'published' : args.p_decision;
  const published = approved && (!claim || ['unclaimed', 'draft', 'archived'].includes(club.status));
  if (data?.club_id !== clubId || data.claim_id !== (claim ? args.p_claim_id : null)
    || data.status !== status || data.club_published !== published || data.owner_granted !== Boolean(approved && email)) {
    throw new Error('The saved decision could not be verified.');
  }
  const receipt = { status, notification: 'not_requested' };
  if (claim && published) receipt.clubUpdate = { id: clubId, status: 'published', verified: true };
  if (email) {
    const template = `club_${claim ? 'claim_' : ''}${args.p_decision}`;
    const variables = { clubName: esc(club.name) };
    if (!approved) variables.notes = esc(args.p_rejection_notes);
    receipt.notification = isCurrent?.() === false ? 'unconfirmed' : await clubEmail(client, email, template, variables);
  }
  return receipt;
}

async function submitMember({ client, scopeId, userId, args, isCurrent }) {
  const payload = clubMemberArguments(args.p_expected_member, args.p_action, args.p_role, args.p_operation_id);
  if (payload.p_club_id !== args.p_club_id || payload.p_member_id !== args.p_member_id) throw new Error('The reviewed membership changed.');
  await verifyPlatformClubAction(client, scopeId, userId, isCurrent);
  const removed = payload.p_action === 'remove';
  const table = client.from('club_members');
  const mutation = removed ? table.delete() : table.update({ role: payload.p_role });
  const data = await confirmRow(exactClubFields(mutation, payload.p_expected_member).select(memberFields), 'The reviewed member changed or the update was denied.');
  if (data.id !== payload.p_member_id || data.club_id !== payload.p_club_id || (!removed && data.role !== payload.p_role)) throw new Error('The saved membership could not be verified.');
  return { removed, member_id: data.id, role: data.role };
}

async function submitMemberAdd({ client, scopeId, userId, args, isCurrent }) {
  const payload = clubMemberAddArguments(args.p_club_id, args.p_expected_player, args.p_role, args.p_operation_id);
  if (payload.p_player_id !== args.p_player_id) throw new Error('The reviewed player changed.');
  await verifyPlatformClubAction(client, scopeId, userId, isCurrent);
  const email = normalizeClubInvitationEmail(payload.p_expected_player.email);
  const [player, club] = await Promise.all([
    exactPlayer(client, payload.p_player_id, email),
    confirmRow(client.from('clubs').select('id,name,short_name').eq('id', payload.p_club_id), 'The reviewed club is no longer available.'),
  ]);
  if (!entityEqual(player, payload.p_expected_player)) throw new Error('The selected player changed after review.');
  if (await clubMemberByEmail(client, payload.p_club_id, email)) throw new Error('This player already has a membership. Review the existing member to change access.');
  await verifyPlatformClubAction(client, scopeId, userId, isCurrent);
  const member = await confirmRow(client.from('club_members').insert({
    club_id: payload.p_club_id, player_id: player.id, user_email: email, role: payload.p_role,
  }).select(memberFields), 'The membership could not be added. Refresh the club before trying again.');
  if (member.club_id !== payload.p_club_id || member.player_id !== player.id || member.role !== payload.p_role || member.user_email !== email) throw new Error('The saved membership could not be verified.');
  const notification = isCurrent?.() === false ? 'unconfirmed' : await clubEmail(client, email, 'club_member_added', {
    clubName: esc(club.short_name || club.name), playerName: esc(player.name), role: member.role,
  });
  return { member: { ...member, players: { name: player.name } }, notification };
}

function invitationReceipt(invite, profileSetup, extra) {
  return { invite_id: invite.id, club_id: invite.club_id, email: invite.email, created_at: invite.created_at,
    status: invite.status, profile_setup_required: profileSetup, ...extra };
}
async function submitInvitation({ client, scopeId, userId, args, isCurrent }) {
  const payload = clubInvitationCreationArguments({
    clubId: args.p_club_id, normalizedEmail: args.p_email, expectedClub: args.p_expected_club, expectedPlayer: args.p_expected_player,
  }, args.p_operation_id);
  const setup = !payload.p_expected_player;
  await verifyPlatformClubAction(client, scopeId, userId, isCurrent);
  const table = () => client.from('club_claim_invites');
  const { data: previous, error: previousError } = await table().select(CLUB_INVITATION_FIELDS)
    .eq('id', payload.p_operation_id).eq('club_id', payload.p_club_id).eq('email', payload.p_email).eq('invited_by', userId).maybeSingle();
  if (previousError) throw new Error('The invitation history could not be checked.');
  if (previous) return invitationReceipt(previous, setup, { already_applied: true, notification_status: 'unconfirmed' });
  const fresh = await prepareClubInvitationCreation({ client, scopeId, userId, clubId: payload.p_club_id, email: payload.p_email });
  if (!entityEqual(fresh.expectedClub, payload.p_expected_club) || !entityEqual(fresh.expectedPlayer, payload.p_expected_player)) throw new Error('The club or recipient changed after review. Reload before inviting.');
  const { data: pending, error: pendingError } = await table().select(CLUB_INVITATION_FIELDS).eq('club_id', payload.p_club_id)
    .eq('email', payload.p_email).eq('status', 'pending').limit(1);
  if (pendingError) throw new Error('Existing pending invitations could not be checked.');
  if (pending?.[0]) return invitationReceipt(pending[0], setup, { already_applied: true, notification_status: 'not_requested' });
  await verifyPlatformClubAction(client, scopeId, userId, isCurrent);
  const invite = await confirmRow(table().insert({
    id: payload.p_operation_id, club_id: payload.p_club_id, email: payload.p_email, invited_by: userId,
  }).select(invitationFieldsWithToken), 'The invitation could not be confirmed.');
  if (invite.id !== payload.p_operation_id || invite.club_id !== payload.p_club_id || invite.email !== payload.p_email || invite.status !== 'pending') {
    throw new Error('The saved invitation could not be verified.');
  }
  const receipt = invitationReceipt(invite, setup, { already_applied: false, notification_status: 'unconfirmed', profile_setup_status: setup ? 'unconfirmed' : 'not_required' });
  if (isCurrent?.() === false || typeof invite.token !== 'string' || !invite.token) return receipt;
  const acceptLink = new URL('/claim-club', publicSite);
  acceptLink.searchParams.set('token', invite.token);
  receipt.notification_status = await clubEmail(client, payload.p_email, 'club_claim_invite', {
    clubName: esc(fresh.expectedClub.name), inviterName: '4M Padel Admin', accept_url: acceptLink.href,
  });
  if (setup && isCurrent?.() !== false) {
    const profileLink = new URL('/profile', publicSite);
    profileLink.searchParams.set('new_invite', 'true');
    profileLink.searchParams.set('claim_token', invite.token);
    try {
      const { error } = await client.auth.signInWithOtp({ email: payload.p_email, options: { emailRedirectTo: profileLink.href } });
      if (!error) receipt.profile_setup_status = 'submitted';
    } catch { /* The saved invitation remains available in history. */ }
  }
  return receipt;
}
const invitationFieldsWithToken = `${CLUB_INVITATION_FIELDS},token`;

export const liveClubDecisionApi = { enabled: available, live: true, load: loadDecision, submit: submitDecision };
export const liveClubMemberApi = { enabled: available, live: true, submit: submitMember };
export const liveClubMemberAddApi = { enabled: available, live: true, search: searchClubMemberPlayers, submit: submitMemberAdd };
export const liveClubInvitationApi = { enabled: available, live: true, prepare: prepareClubInvitationCreation, submit: submitInvitation };
