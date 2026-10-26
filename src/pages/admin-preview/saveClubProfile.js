import { clubDraftFields, createClubDraft, reviewClubDraft } from './clubDraft.js';

// Deliberately limited to ordinary fields in current ClubManager.handleSave.
// Website/logo have club-group inheritance; status and memberships change access.
export const CLUB_PROFILE_FIELDS = ['name', 'short_name', 'about', 'city', 'address', 'contact_email', 'contact_phone', 'whatsapp_number'];
export const editableClubProfileFields = clubDraftFields.filter(([key]) => CLUB_PROFILE_FIELDS.includes(key));

export function clubProfilePatch(original, draft) {
  if (!original?.id) throw new Error('Select a club before saving.');
  const base = createClubDraft(original);
  const proposed = { ...base, ...Object.fromEntries(CLUB_PROFILE_FIELDS.map(key => [key, draft[key] ?? base[key]])) };
  const { errors, changes } = reviewClubDraft(original, proposed);
  const relevantError = CLUB_PROFILE_FIELDS.find(key => errors[key]);
  if (relevantError) throw new Error(errors[relevantError]);
  return Object.fromEntries(changes.filter(change => CLUB_PROFILE_FIELDS.includes(change.key)).map(change => {
    // Match existing ClubManager normalization: names trimmed; other strings
    // retained as entered, with empty fields represented as null.
    const raw = String(proposed[change.key] ?? '');
    return [change.key, ['name', 'short_name'].includes(change.key) ? raw.trim() || null : raw || null];
  }));
}

export async function saveClubProfile({ client, original, draft, scopeId }) {
  if (scopeId !== 'all') throw new Error('Platform Clubs access is required.');
  const patch = clubProfilePatch(original, draft);
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth?.user?.email) throw new Error('Sign in before saving club details.');
  const { data: permission, error: permissionError } = await client.from('admin_sidebar_permissions').select('role').eq('email', auth.user.email).maybeSingle();
  if (permissionError || permission?.role !== 'super_admin') throw new Error('A verified super-admin account is required.');
  const { data: current, error: readError } = await client.from('clubs').select('*').eq('id', original.id).single();
  if (readError || !current) throw new Error('This club could not be verified. Close and reload before saving.');
  for (const field of [...CLUB_PROFILE_FIELDS, 'updated_at']) {
    if ((current[field] ?? null) !== (original[field] ?? null)) throw new Error('Club details changed since opening. Close and reload before saving.');
  }
  if (!Object.keys(patch).length) return { changed: false, record: current };
  let query = client.from('clubs').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', original.id);
  for (const field of [...CLUB_PROFILE_FIELDS, 'updated_at']) query = current[field] == null ? query.is(field, null) : query.eq(field, current[field]);
  const { data, error } = await query.select('*').maybeSingle();
  if (error || !data) throw new Error('Save could not be confirmed. The club or your access may have changed. Close and reload before trying again.');
  return { changed: true, record: data };
}
