// Source: current ClubManager loadLookups/loadLinkedOrgs and ClubGroupManager.
// Relationships also grant club access through can_manage_club.
async function pages(query, signal) {
  const rows = [];
  for (let offset = 0; ;) {
    signal?.throwIfAborted();
    let request = query().range(offset, offset + 499);
    if (signal) request = request.abortSignal(signal);
    const { data, error } = await request;
    signal?.throwIfAborted();
    if (error || !Array.isArray(data)) throw new Error(error?.message || 'Club relationships could not be loaded.');
    rows.push(...data);
    if (!data.length) return rows;
    offset += data.length;
  }
}
async function authorize({ client, scopeId, userId, signal }) {
  if (!userId || scopeId !== 'all') throw new Error('Sign in to the platform Clubs workspace to view relationships.');
  signal?.throwIfAborted();
  const { data, error } = await client.auth.getUser();
  signal?.throwIfAborted();
  if (error || data?.user?.id !== userId || !data.user.email?.trim()) throw new Error('The signed-in account changed. Reopen Clubs.');
  const { data: active, error: activeError } = await client.rpc('account_is_active');
  signal?.throwIfAborted();
  if (activeError || active !== true) throw new Error('An active account is required.');
  const { data: permitted, error: roleError } = await client.rpc('is_super_admin', { user_email: data.user.email });
  signal?.throwIfAborted();
  if (roleError || permitted !== true) throw new Error('Current super-admin authority is required.');
  signal?.throwIfAborted();
}
async function finalIdentity({ client, userId, signal }) {
  signal?.throwIfAborted();
  const { data, error } = await client.auth.getUser();
  signal?.throwIfAborted();
  if (error || data?.user?.id !== userId) throw new Error('The signed-in account changed. Reopen Clubs.');
}
export function safeClubRelationshipImage(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}
export async function loadClubOrganisations(options) {
  const { client, clubId, signal } = options;
  if (!clubId) throw new Error('Select a club first.');
  await authorize(options);
  const [links, organisations] = await Promise.all([
    pages(() => client.from('club_organisations').select('id,club_id,organisation_id,created_at,organisations(id,name,slug,logo_url,status)').eq('club_id', clubId).order('id'), signal),
    pages(() => client.from('organisations').select('id,name,slug,logo_url,status').eq('status', 'approved').order('name').order('id'), signal),
  ]);
  if (links.some(row => String(row.club_id) !== String(clubId))) throw new Error('Club relationship scope could not be verified.');
  await finalIdentity(options);
  return { links, organisations };
}
export function reviewClubOrganisation({ club, snapshot, organisationId, action }) {
  if (!club?.id || !['link', 'unlink'].includes(action)) throw new Error('Select a club and relationship action.');
  const existing = snapshot.links.find(row => String(row.organisation_id) === String(organisationId));
  const organisation = snapshot.organisations.find(row => String(row.id) === String(organisationId)) || existing?.organisations;
  if (action === 'link' && (existing || !organisation)) throw new Error('Choose an approved organisation that is not already linked.');
  if (action === 'unlink' && !existing) throw new Error('This organisation is no longer linked in the loaded snapshot.');
  return structuredClone({ action, club: { id: club.id, name: club.name }, organisation: organisation || { id: organisationId, name: 'Organisation unavailable' }, link: existing || null });
}
export async function saveClubOrganisation(options, review) {
  const { client, clubId, signal } = options;
  await authorize(options);
  if (review?.club?.id !== clubId || !review.organisation?.id || !['link', 'unlink'].includes(review.action)) {
    throw new Error('Review the selected club and organisation before changing access.');
  }
  const organisationId = review.organisation.id;
  const relationship = () => client.from('club_organisations');
  const [club, organisation, link] = await Promise.all([
    client.from('clubs').select('id,name').eq('id', clubId).maybeSingle(),
    client.from('organisations').select('id,name,status').eq('id', organisationId).maybeSingle(),
    relationship().select('id,club_id,organisation_id,created_at').eq('club_id', clubId).eq('organisation_id', organisationId).maybeSingle(),
  ]);
  signal?.throwIfAborted();
  if (club.error || organisation.error || link.error || club.data?.id !== clubId || club.data?.name !== review.club.name
      || organisation.data?.id !== organisationId || organisation.data?.name !== review.organisation.name
      || organisation.data?.status !== review.organisation.status) {
    throw new Error('The club or organisation changed. Refresh the relationship review.');
  }
  const adding = review.action === 'link';
  const existing = link.data;
  if (adding ? organisation.data.status !== 'approved' || existing
    : !existing || existing.id !== review.link?.id || existing.created_at !== review.link.created_at) {
    throw new Error('The relationship changed. Refresh before continuing.');
  }
  await authorize(options);
  await finalIdentity(options);
  const query = adding ? relationship().insert({ club_id: clubId, organisation_id: organisationId })
    : relationship().delete().eq('id', existing.id).eq('club_id', clubId).eq('organisation_id', organisationId).eq('created_at', existing.created_at);
  const { data, error } = await query.select('id,club_id,organisation_id').maybeSingle();
  signal?.throwIfAborted();
  if (error || data?.club_id !== clubId || data?.organisation_id !== organisationId) {
    throw new Error('The organisation relationship could not be confirmed. Refresh before trying again.');
  }
  return data;
}
export async function loadClubGroupDirectory(options) {
  const { client, signal } = options;
  await authorize(options);
  const [groups, clubs] = await Promise.all([
    pages(() => client.from('club_groups').select('id,name,short_name,slug,about,website_url,contact_email,contact_phone,whatsapp_number,city,province,logo_url,cover_image_url,status,share_logo,share_website,brand_color,socials,updated_at').order('name').order('id'), signal),
    pages(() => client.from('clubs').select('id,name,short_name,city,logo_url,website_url,status,group_id,updated_at').order('name').order('id'), signal),
  ]);
  await finalIdentity(options);
  const venuesByGroup = clubs.reduce((indexed, club) => {
    if (!indexed.has(club.group_id)) indexed.set(club.group_id, []);
    indexed.get(club.group_id).push(club);
    return indexed;
  }, new Map());
  const rows = groups.map(group => ({ ...group, venues: venuesByGroup.get(group.id) || [] }));
  return options.includeCandidates ? { rows, clubs } : rows;
}
