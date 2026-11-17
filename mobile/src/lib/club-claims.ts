import { supabase } from './supabase';
import { fetchClub, type ClubDetails } from './clubs';

export const CLUB_CLAIM_ROLES = ['Owner', 'Manager', 'Club Director', 'Operations', 'Admin', 'Other'];
export type ClubClaimAccount = { id: string; email: string };
export type ClubClaimForm = { name: string; phone: string; role: string; notes: string };
export type ClubClaimContext = { club: ClubDetails; playerId: number; name: string; phone: string; pending: boolean; hasOwner: boolean };
const emailPattern = (email: string) => email.replace(/[\\%_]/g, '\\$&');

export async function clubHasOwner(clubId: string, signal?: AbortSignal): Promise<boolean> {
  let query = supabase.from('club_members_public').select('club_id', { count: 'exact', head: true }).eq('club_id', clubId).eq('role', 'owner');
  if (signal) query = query.abortSignal(signal);
  const { count, error } = await query;
  if (error || typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) throw new Error('Club ownership couldn’t be checked. Please try again.');
  return count > 0;
}

async function currentAccount(expected: ClubClaimAccount) {
  const { data, error } = await supabase.auth.getUser();
  const user = data.user;
  if (error || !user || user.is_anonymous || !user.email) throw new Error('Please sign in to claim this club.');
  if (user.id !== expected.id || user.email.trim().toLowerCase() !== expected.email) throw new Error('Your account changed. Reopen the club claim and try again.');
  return user;
}

export async function fetchClubClaimContext(slug: string, account: ClubClaimAccount, signal?: AbortSignal): Promise<ClubClaimContext> {
  await currentAccount(account);
  const club = await fetchClub(slug, signal);
  if (!club) throw new Error('This club is no longer available.');
  let playerQuery = supabase.from('players').select('id,name,contact_number').ilike('email', emailPattern(account.email));
  let pendingQuery = supabase.from('club_claim_requests').select('id').eq('club_id', club.id).ilike('requester_email', emailPattern(account.email)).eq('status', 'pending').limit(1);
  if (signal) { playerQuery = playerQuery.abortSignal(signal); pendingQuery = pendingQuery.abortSignal(signal); }
  const [profile, pending, hasOwner] = await Promise.all([playerQuery.maybeSingle(), pendingQuery, clubHasOwner(club.id, signal)]);
  if (profile.error || pending.error) throw new Error('Your club claim details couldn’t load. Please try again.');
  if (!profile.data || !Number.isSafeInteger(Number(profile.data.id)) || Number(profile.data.id) <= 0) throw new Error('Create your player profile before claiming a club.');
  return { club, playerId: Number(profile.data.id), name: profile.data.name || '', phone: profile.data.contact_number || '', pending: !!pending.data?.length, hasOwner };
}

export function clubClaimErrors(form: ClubClaimForm) {
  return {
    name: !form.name.trim() ? 'Enter your full name.' : '',
    phone: !form.phone.trim() ? 'Enter a phone or WhatsApp number.' : '',
    role: !CLUB_CLAIM_ROLES.includes(form.role) ? 'Select your role at this club.' : '',
  };
}

/** Same pending request and transactional templates as the website; approval stays with the 4M team. */
export async function submitClubClaim(slug: string, account: ClubClaimAccount, form: ClubClaimForm) {
  if (Object.values(clubClaimErrors(form)).some(Boolean)) throw new Error('Complete your name, phone number and role before submitting.');
  const context = await fetchClubClaimContext(slug, account);
  if (context.pending) return { alreadyPending: true, emailsSent: true };
  if (context.hasOwner) throw new Error('This club already has an owner. Contact the 4M team if you need access.');
  const { data, error: sessionError } = await supabase.auth.getSession();
  const session = data.session;
  if (sessionError || session?.user.id !== account.id || session.user.email?.trim().toLowerCase() !== account.email) throw new Error('Your account changed. Reopen the club claim and try again.');
  const { error } = await supabase.from('club_claim_requests').insert({
    club_id: context.club.id, requester_player_id: context.playerId, requester_email: account.email,
    full_name: form.name.trim(), contact_phone: form.phone.trim(), primary_role: form.role, notes: form.notes.trim() || null, status: 'pending',
  });
  if (error?.code === '23505') return { alreadyPending: true, emailsSent: true };
  if (error) throw new Error('Your club claim couldn’t be submitted. Please try again.');
  const variables = { clubName: context.club.name, contactEmail: account.email, contactPhone: form.phone.trim(), creatorName: form.name.trim(), role: form.role };
  const notifications = await Promise.allSettled([
    supabase.functions.invoke('send-email', { headers: { Authorization: `Bearer ${session.access_token}` }, body: { to: account.email, template: 'club_claim_applied', variables } }),
    supabase.functions.invoke('send-email', { headers: { Authorization: `Bearer ${session.access_token}` }, body: { to: 'markstillerman@gmail.com', template: 'admin_club_claim_applied', variables } }),
  ]);
  return { alreadyPending: false, emailsSent: notifications.every(result => result.status === 'fulfilled' && !result.value.error && !result.value.data?.error) };
}
