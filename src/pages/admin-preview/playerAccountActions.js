import { FOURM_PUBLIC_ORIGIN } from '../../constants/site.js';
import { PROFILE_FIELDS, profilePatch } from './playerProfileEdit.js';
import { readAll } from './playersData.js';

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

export async function sendPlayerLoginInvitation(client, player, context) {
  const fresh = await verifySelectedPlayer(client, player, context);
  const email = String(fresh.email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('A valid player email is required.');
  const result = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: `${FOURM_PUBLIC_ORIGIN}/profile?new_invite=true` } });
  if (result.error || result.data?.error) throw new Error('The invitation request could not be confirmed. Check before sending again; it may already have been processed.');
  return { accepted: true };
}

async function verifySelectedPlayer(client, player, context, fields = 'id,name,email') {
  await verifyPlayerAccountAccess(client, context);
  const { data, error } = await client.from('players').select(fields).eq('id', player.id).single();
  if (error || !data || String(data.id) !== String(player.id) || data.name !== player.name || data.email !== player.email) {
    throw new Error('This player record changed. Close and reopen the action.');
  }
  await verifyPlayerAccountAccess(client, context);
  return data;
}

export async function readPlayerAccountPreview(client, player, context, signal) {
  const fields = 'id,name,email,home_club,category,region,bio,rank_label,points,license_type,paid_registration,rankedin_id';
  const profile = await verifySelectedPlayer(client, player, context, fields);
  const email = String(profile.email || '').trim().toLowerCase();
  const literal = email.replace(/[\\%_]/g, '\\$&');
  const registrationFields = 'id,event_id,email,partner_email,division,payment_status,partner_payment_status,status,calendar(id,event_name,start_date)';
  const registrationsFor = field => readAll(() => client.from('event_registrations')
    .select(registrationFields).ilike(field, literal).neq('status', 'withdrawn').order('id'), signal);
  const [own, partner, licenses] = await Promise.all([
    email ? registrationsFor('email') : [],
    email ? registrationsFor('partner_email') : [],
    readAll(() => client.from('temporary_licenses').select('id,event_id,event_name,event_date').eq('player_id', profile.id).is('revoked_at', null).order('id'), signal),
  ]);
  await verifyPlayerAccountAccess(client, context);
  const entries = new Map();
  for (const [rows, field, statusField] of [[own, 'email', 'payment_status'], [partner, 'partner_email', 'partner_payment_status']]) {
    for (const row of rows) {
      if (row[field]?.trim().toLowerCase() !== email || row.status === 'withdrawn' || !row.calendar || String(row.calendar.id) !== String(row.event_id)) continue;
      if (!entries.has(row.id)) entries.set(row.id, { id: row.id, event: row.calendar.event_name, date: row.calendar.start_date, division: row.division, payment: row[statusField] });
    }
  }
  return {
    profile,
    entries: [...entries.values()].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))),
    licenses,
  };
}

export async function sendPlayerRecoveryEmail(client, player, context) {
  const verified = await verifySelectedPlayer(client, player, context);
  const email = String(verified.email || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('A valid player email is required.');
  const result = await client.auth.resetPasswordForEmail(email, { redirectTo: `${FOURM_PUBLIC_ORIGIN}/reset-password` });
  if (result.error) throw new Error('The recovery request could not be confirmed. Check before sending it again.');
  return { accepted: true };
}

export async function deletePlayerProfile(client, player, context) {
  const verified = await verifySelectedPlayer(client, player, context);
  let query = client.from('players').delete().eq('id', verified.id);
  query = verified.email === null ? query.is('email', null) : query.eq('email', verified.email);
  const { data, error } = await query.select('id').maybeSingle();
  if (error || String(data?.id) !== String(verified.id)) throw new Error('Deletion could not be confirmed. Reload the directory before trying again.');
  return data.id;
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
