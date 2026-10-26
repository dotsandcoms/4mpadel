import { PROFILE_FIELDS, profilePatch } from './playerProfileEdit.js';

// Current PlayerManager creates a profile row, not an Auth account or invitation.
export function playerCreationPayload(draft, clubs = []) {
  const payload = profilePatch({}, draft, clubs);
  return Object.fromEntries(PROFILE_FIELDS.map(key => [key, key in payload ? payload[key] : key === 'points' ? 0 : key === 'sponsors' ? '[]' : key === 'club_id' || ['playing_hand', 'court_side'].includes(key) ? null : key === 'approved' ? true : '']));
}

export async function verifyPlayerAccountAccess(client, { userId, scopeId, isCurrent = () => true }) {
  const current = () => { if (!isCurrent()) throw new Error('The account context changed. Reopen this action.'); };
  current();
  if (!userId || scopeId !== 'all') throw new Error('Player account actions require All 4M Padel scope.');
  const { data, error } = await client.auth.getUser();
  current();
  if (error || data?.user?.id !== userId || !data.user.email) throw new Error('Your signed-in account changed. Reopen this action.');
  const { data: active, error: activeError } = await client.rpc('account_is_active');
  current();
  if (activeError || active !== true) throw new Error('An active signed-in account is required.');
  const { data: allowed, error: accessError } = await client.rpc('is_super_admin', { user_email: data.user.email });
  current();
  if (accessError || allowed !== true) throw new Error('A currently authorised super admin is required.');
  const { data: verified, error: verifyError } = await client.auth.getUser();
  current();
  if (verifyError || verified?.user?.id !== userId || verified.user.email !== data.user.email) throw new Error('Your signed-in account changed. Reopen this action.');
}

export async function createPlayerAccountProfile(client, draft, clubs, context) {
  const payload = playerCreationPayload(draft, clubs);
  await verifyPlayerAccountAccess(client, context);
  if (!context.isCurrent()) throw new Error('The account context changed. Reopen this action.');
  const { data, error } = await client.from('players').insert([payload]).select(['id', ...PROFILE_FIELDS].join(',')).single();
  if (error || !/^[1-9]\d*$/.test(String(data?.id)) || !Number.isSafeInteger(Number(data.id)) || Object.entries(payload).some(([key, value]) => data[key] !== value)) throw new Error('Creation could not be confirmed. Close and refresh the directory before trying again to avoid a duplicate.');
  return data;
}

export async function sendPlayerLoginInvitation(client, player, origin, context) {
  await verifyPlayerAccountAccess(client, context);
  const { data: fresh, error } = await client.from('players').select('id,name,email').eq('id', player.id).single();
  if (error || !fresh || String(fresh.id) !== String(player.id) || fresh.email !== player.email || fresh.name !== player.name) throw new Error('The recipient changed or could not be verified. Close and reopen before sending.');
  const email = String(fresh.email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('A valid player email is required.');
  const url = new URL(origin);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid sign-in redirect origin.');
  await verifyPlayerAccountAccess(client, context);
  const result = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: `${url.origin}/profile?new_invite=true` } });
  if (result.error || result.data?.error) throw new Error('The invitation request could not be confirmed. Check before sending again; it may already have been processed.');
  return { accepted: true };
}

export async function withPlayerActionDeadline(operation, context, timeoutMs = 30000) {
  let expired = false, timer;
  const guarded = { ...context, isCurrent: () => !expired && context.isCurrent() };
  try {
    return await Promise.race([operation(guarded), new Promise((_, reject) => {
      timer = setTimeout(() => { expired = true; reject(new Error('The request timed out and its outcome is uncertain. Check before reopening; do not resend automatically.')); }, timeoutMs);
    })]);
  } finally { expired = true; clearTimeout(timer); }
}

export const HELD_PLAYER_ACTIONS = {
  'Reset password': 'Password reset is held for security review. The existing endpoint can change any sign-in account password; target restrictions and an audit trail need review before activation. No password is collected here.',
  'Test login': 'Test login is held. The existing screen uses a browser email override rather than a separately authorised impersonation session. Your identity and session will not be changed.',
  'Delete player': 'Deletion is held pending reviewed activation. The existing action deletes the player record, not the sign-in account, and may affect linked records. Nothing will be deleted here.',
  'Send login invite': 'Login invitation sending is held for activation review. The existing action emails a sign-in link and may create a sign-in account when the address is new. No email is sent here.',
};
