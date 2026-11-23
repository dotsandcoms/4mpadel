// Field mappings and conversions mirror CURRENT MAIN PlayerManager.handleEdit /
// handleSubmit. This helper does not send invitations or alter auth identities.
// Licence flags are server-maintained projections, not editable profile fields.
export const PROFILE_FIELDS = ['name', 'rank_label', 'points', 'win_rate', 'image_url', 'home_club', 'club_id', 'age_group', 'category', 'level', 'nationality', 'bio', 'sponsors', 'contact_number', 'email', 'gender', 'approved', 'region', 'racket_brand', 'playing_hand', 'court_side'];
export function createPlayerProfileDraft(player) {
  let sponsors = player.sponsors || '';
  if (sponsors) {
    try { const parsed = JSON.parse(sponsors); sponsors = Array.isArray(parsed) ? parsed.join(', ') : sponsors; } catch { /* Source accepts legacy comma text. */ }
  }
  return {
    ...Object.fromEntries(PROFILE_FIELDS.map(key => [key, player[key] || ''])),
    name: player.name || '', points: player.points ?? '',
    home_club: player.club_id ? '' : (player.home_club || ''),
    club_id: player.club_id || '', sponsors,
    approved: player.approved !== false,
  };
}
export function profilePatch(original, draft, clubs = []) {
  if (!String(draft.name || '').trim()) throw new Error('Player name is required.');
  const initial = createPlayerProfileDraft(original), patch = {};
  const changed = key => Object.hasOwn(draft, key) && String(draft[key] ?? '') !== String(initial[key] ?? '');
  for (const key of PROFILE_FIELDS) {
    if (['club_id', 'home_club'].includes(key) || !changed(key)) continue;
    if (key === 'points') patch.points = parseInt(draft.points) || 0;
    else if (key === 'sponsors') patch.sponsors = JSON.stringify(String(draft.sponsors || '').split(',').map(value => value.trim()).filter(Boolean));
    else if (key === 'approved') {
      if (typeof draft[key] !== 'boolean') throw new Error(`${key} must be a checkbox value.`);
      patch[key] = draft[key];
    } else if (['playing_hand', 'court_side'].includes(key)) {
      const allowed = key === 'playing_hand' ? ['right', 'left'] : ['left', 'right', 'either'];
      if (draft[key] && !allowed.includes(draft[key])) throw new Error('Select a supported playing preference.');
      patch[key] = draft[key] || null;
    } else patch[key] = draft[key];
  }
  if (changed('club_id') || changed('home_club')) {
    const clubId = draft.club_id ?? initial.club_id;
    const club = clubId && clubId !== 'Other' ? clubs.find(row => String(row.id) === String(clubId)) : null;
    if (clubId && clubId !== 'Other' && !club) throw new Error('The selected club is unavailable. Reload the club list before saving.');
    patch.club_id = clubId === 'Other' ? null : (clubId || null);
    patch.home_club = clubId === 'Other' ? draft.home_club : (club ? club.name : '');
  }
  // Source defaults must not normalize untouched nulls/legacy values. Also omit
  // changes such as typing "001" for an existing numeric points value of 1.
  return Object.fromEntries(Object.entries(patch).filter(([key, value]) => value !== original[key]));
}
export async function verifyPlayerEditAccess(client, context) {
  const current = () => { if (context && (!context.isCurrent?.() || (context.scopeId !== undefined && context.scopeId !== 'all'))) throw new Error('The editing context changed. Close and reopen the profile.'); };
  current();
  const { data, error } = await client.auth.getUser();
  current();
  if (error || !data?.user?.email) throw new Error('Sign in before editing a player.');
  if (context && (!context.userId || context.userId !== data.user.id)) throw new Error('The signed-in account changed. Close and reopen the profile.');
  // ILIKE is case-insensitive, but authenticated addresses must be literal:
  // underscores and percent signs are valid email characters, not wildcards.
  const email = data.user.email.replace(/[\\%_]/g, '\\$&');
  const { data: grant, error: grantError } = await client.from('admin_sidebar_permissions').select('role,allowed_tabs').ilike('email', email).maybeSingle();
  if (grantError || !(grant?.role === 'super_admin' || grant?.allowed_tabs?.includes('players'))) throw new Error('A verified Players admin grant is required to edit profiles here.');
  current();
  if (context) {
    const { data: final, error: finalError } = await client.auth.getUser();
    current();
    if (finalError || final?.user?.id !== context.userId || final.user.email !== data.user.email) throw new Error('The signed-in account changed. Close and reopen the profile.');
  }
  return data.user;
}
export async function loadEditablePlayer(client, id, context) {
  await verifyPlayerEditAccess(client, context);
  const { data, error } = await client.from('players').select(['id', ...PROFILE_FIELDS].join(',')).eq('id', id).single();
  if (error || !data) throw new Error('The player profile could not be loaded.');
  return data;
}
export async function savePlayerProfile(client, original, draft, clubs = [], context) {
  const patch = profilePatch(original, draft, clubs);
  const fresh = await loadEditablePlayer(client, original.id, context);
  const keys = Object.keys(patch);
  const coupledFields = [['club_id', 'home_club']];
  const guardKeys = [...new Set([...keys, ...coupledFields.filter(pair => pair.some(key => keys.includes(key))).flat()])];
  if (guardKeys.some(key => fresh[key] !== original[key])) throw new Error('This profile changed since opening. Close and reopen before saving.');
  if (!keys.length) return fresh;
  if (context) await verifyPlayerEditAccess(client, context);
  // Keep the conflict guard in the UPDATE as well, not only the read preflight.
  let query = client.from('players').update(patch).eq('id', original.id);
  for (const key of guardKeys) query = original[key] == null ? query.is(key, null) : query.eq(key, original[key]);
  const { data, error } = await query.select(['id', ...PROFILE_FIELDS].join(',')).single();
  if (error || !data) throw new Error('The save could not be confirmed. Close and reopen before trying again.');
  return data;
}
