import { verifyClubCreationAccess } from './clubCreation.js';
import { readAll } from './playersData.js';

// Invitation creation is NOT membership creation. MAIN sends a claim invitation
// and, without an existing player, a separate profile setup email. This boundary
// only prepares a local preview: no tokens, writes, mail or auth OTP operations.
// The source has no expires_at; never infer expiry from created_at.
export const CLUB_INVITATION_FIELDS = 'id,club_id,email,status,created_at,accepted_at';
const checkCancelled = signal => { if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError'); };
function checkContext(clubId, userId) {
  if (typeof clubId !== 'string' || !clubId.trim()) throw new Error('Select a club first.');
  if (typeof userId !== 'string' || !userId.trim()) throw new Error('Sign in before reviewing club invitations.');
}
export function normalizeClubInvitationEmail(value) {
  if (typeof value !== 'string') throw new Error('Enter one valid email address.');
  const email = value.trim().toLowerCase();
  const parts = email.split('@'), local = parts[0], domain = parts[1];
  if (email.length > 254 || parts.length !== 2 || !local || local.length > 64
    || !/^[a-z0-9!#$%&'*+/=?^_`{|}~.-]+$/.test(local)
    || local.startsWith('.') || local.endsWith('.') || local.includes('..')
    || !domain || !domain.includes('.') || domain.split('.').some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
    throw new Error('Enter one valid email address, without a name or recipient list.');
  }
  return email;
}
export async function loadClubInvitations({ client, scopeId, userId, clubId, signal }) {
  checkContext(clubId, userId); checkCancelled(signal);
  await verifyClubCreationAccess(client, scopeId, userId); checkCancelled(signal);
  return readAll(() => client.from('club_claim_invites').select(CLUB_INVITATION_FIELDS)
    .eq('club_id', clubId).order('created_at', { ascending: false }).order('id'), signal);
}
export async function searchClubInvitationPlayers({ client, scopeId, userId, clubId, query, signal }) {
  checkContext(clubId, userId); checkCancelled(signal);
  if (typeof query !== 'string') throw new Error('Enter a player name or email.');
  const term = query.trim();
  if (term.length < 2) return [];
  // PostgREST aliases * to a LIKE wildcard, even within a quoted value. Reject
  // that operator instead of unexpectedly broadening a recipient lookup.
  if (term.length > 200 || /[\u0000-\u001f\u007f*]/.test(term)) throw new Error('Use up to 200 characters without wildcard stars or control characters.');
  await verifyClubCreationAccess(client, scopeId, userId); checkCancelled(signal);
  const pattern = '%' + term.replace(/[\\%_]/g, '\\$&') + '%';
  const quoted = '"' + pattern.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
  // CURRENT MAIN ClubManager: min two characters, these four fields, maximum
  // eight non-null-email players. No club-member exclusion: this is an invite.
  let request = client.from('players').select('id,name,email,image_url')
    .or(`name.ilike.${quoted},email.ilike.${quoted}`).not('email', 'is', null).limit(8);
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request;
  checkCancelled(signal);
  if (error || !Array.isArray(data)) throw new Error('Could not search player profiles. Please try again.');
  return data;
}
// Caller must verify authority first. Read every candidate page because a server
// row cap or unrelated substring match must not hide an exact duplicate/profile.
export async function loadClubInvitationProfile(client, normalizedEmail, signal) {
  const email = normalizeClubInvitationEmail(normalizedEmail);
  checkCancelled(signal);
  // Superset only: outer wildcards allow stored whitespace. PostgREST treats *
  // as a wildcard alias; deliberately broaden it here and enforce exact identity
  // below, never infer identity from the database's LIKE match alone.
  const candidatePattern = '%' + email.replace(/[\\%_]/g, '\\$&').replace(/\*/g, '%') + '%';
  let rows;
  try {
    rows = await readAll(() => client.from('players').select('id,name,email')
      .ilike('email', candidatePattern).order('id'), signal);
  } catch (error) {
    checkCancelled(signal);
    if (error?.name === 'AbortError') throw error;
    throw new Error('Could not verify the player profile. No invitation was prepared.');
  }
  const exact = rows.filter(row => typeof row.email === 'string' && row.email.trim().toLowerCase() === email);
  if (exact.length > 1) throw new Error('Multiple player profiles use this email. Resolve the duplicate profiles before inviting.');
  if (exact.length && exact[0].id == null) throw new Error('The player profile is incomplete. No invitation was prepared.');
  return exact[0] || null;
}
export async function prepareClubInvitationPreview({ client, scopeId, userId, clubId, email, signal }) {
  checkContext(clubId, userId); checkCancelled(signal);
  const normalizedEmail = normalizeClubInvitationEmail(email);
  await verifyClubCreationAccess(client, scopeId, userId); checkCancelled(signal);
  const data = await loadClubInvitationProfile(client, normalizedEmail, signal);
  checkCancelled(signal);
  const existingPlayer = data?.id != null;
  return { clubId, normalizedEmail, existingPlayer, profileSetupRequired: !existingPlayer };
}
