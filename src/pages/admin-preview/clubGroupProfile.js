import { entityEqual } from './organisationFederationData.js';
import { exactClubFields, verifyPlatformClubAction } from './liveClubOperations.js';
import { organisationImageExtension, normaliseOrganisationField } from './organisationProfileFields.js';

export const groupFields = {
  name: 'Group name', short_name: 'Short name', slug: 'Public page slug', about: 'Description', website_url: 'Website',
  brand_color: 'Brand colour', status: 'Status', contact_email: 'Contact email', contact_phone: 'Contact phone',
  whatsapp_number: 'WhatsApp number', city: 'City', province: 'Province', logo_url: 'Logo URL', cover_image_url: 'Cover image URL',
  share_logo: 'Share logo with venues', share_website: 'Share website with venues',
};
export const groupSocials = ['instagram', 'facebook', 'tiktok', 'playtomic'];
export const groupStatuses = { unclaimed: 'Unclaimed', in_review: 'In review', published: 'Published', '4m_approved': '4M approved', '4m_premium': '4M premium' };
const fields = [...Object.keys(groupFields), 'socials'];
const columns = ['id', ...fields, 'updated_at'];
const venueFields = ['id', 'name', 'group_id', 'logo_url', 'website_url', 'updated_at'];
const snapshot = (row, keys) => Object.fromEntries(keys.map(field => [field, row[field] ?? null]));
const slugify = value => String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const groupSlug = slugify;

export function groupProfilePatch(group, draft) {
  const patch = {};
  if (!String(draft.name || '').trim() || !slugify(draft.slug)) throw new Error('Enter a group name and a valid page slug.');
  for (const field of fields) {
    if (group && entityEqual(draft[field] ?? '', group[field] ?? '')) continue;
    const value = draft[field];
    if (field === 'status') {
      if (!Object.hasOwn(groupStatuses, value)) throw new Error('Choose a valid group status.');
      patch.status = value;
    } else if (field === 'slug') patch.slug = slugify(value);
    else if (field.startsWith('share_')) patch[field] = value === true;
    else if (field === 'socials') patch.socials = Object.fromEntries(groupSocials.map(platform => [platform, String(value?.[platform] || '').trim()]));
    else patch[field] = normaliseOrganisationField(field, value);
  }
  return patch;
}

const access = options => verifyPlatformClubAction(options.client,options.scopeId,options.userId,options.isCurrent);

export async function saveClubGroupProfile(options, group, draft, files, operationId) {
  const {client} = options;
  const patch = groupProfilePatch(group,draft);
  const media = Object.entries(files).map(([field,file]) => ({ field, file, extension:organisationImageExtension(field,file) }));
  const groupId = group?.id || operationId;
  if (!groupId || (!Object.keys(patch).length && !media.length)) throw new Error('Review the group changes before saving.');
  await access(options);
  const expected = group && snapshot(group,columns);
  if (group) {
    const {data,error} = await client.from('club_groups').select(columns.join(',')).eq('id',groupId).maybeSingle();
    if (error || !data || !entityEqual(snapshot(data,columns),expected)) throw new Error('The club group changed. Refresh groups before saving.');
  }
  for (const {field,file,extension} of media) {
    await access(options);
    const kind = field === 'logo_url' ? 'logo' : 'cover';
    const path = `club-groups/${groupId}/${kind}-${crypto.randomUUID()}.${extension}`;
    const bucket = client.storage.from('profile-pics');
    options.onAttempt?.();
    const {error} = await bucket.upload(path,file,{upsert:false,contentType:file.type,cacheControl:'3600'});
    if (error) throw new Error('The group image upload could not be confirmed.');
    const url = bucket.getPublicUrl(path).data?.publicUrl;
    if (!url) throw new Error('The uploaded image address could not be confirmed.');
    patch[field] = normaliseOrganisationField(field,url);
  }
  await access(options);
  const payload = {...patch,updated_at:new Date().toISOString()};
  const query = group ? exactClubFields(client.from('club_groups').update(payload),expected)
    : client.from('club_groups').insert({ id:groupId,...payload });
  options.onAttempt?.();
  const {data,error} = await query.select(columns.join(',')).maybeSingle();
  if (error || data?.id !== groupId || Object.entries(patch).some(([key,value])=>!entityEqual(data[key],value))) {
    throw new Error('The group save could not be confirmed.');
  }
  return data;
}

export function reviewClubGroupBranding(group) {
  const shared = {};
  if (group.share_logo && group.logo_url) shared.logo_url = group.logo_url;
  if (group.share_website && group.website_url) shared.website_url = group.website_url;
  const venues = group.venues.filter(venue => Object.keys(shared).some(key=>!entityEqual(venue[key],shared[key])))
    .map(venue => snapshot(venue,venueFields));
  return { group:snapshot(group,columns), venues, shared };
}

export async function saveClubGroupBranding(options, review) {
  const {client} = options;
  if (!review?.venues?.length) throw new Error('There are no linked venues with branding changes.');
  const applied = [];
  for (const venue of review.venues) {
    try {
      await access(options);
      const {data,error} = await client.from('club_groups').select(columns.join(',')).eq('id',review.group.id).maybeSingle();
      if (error || !data || !entityEqual(snapshot(data,columns),review.group)) throw new Error('The group branding changed.');
      const current = reviewClubGroupBranding({...data,venues:[venue]});
      if (venue.group_id !== review.group.id || !entityEqual(current.shared,review.shared)) throw new Error('The reviewed venue or branding changed.');
      await access(options);
      options.onAttempt?.();
      const result = await exactClubFields(client.from('clubs').update({...current.shared,updated_at:new Date().toISOString()}),venue).select(venueFields.join(',')).maybeSingle();
      if (result.error || result.data?.id !== venue.id || Object.entries(current.shared).some(([field,value])=>result.data[field]!==value)) {
        throw new Error(`Branding could not be confirmed for ${venue.name}.`);
      }
      applied.push(venue.id);
    } catch (error) {
      if (!applied.length) throw error;
      return { applied, warning:`Only ${applied.length} venue updates were confirmed. ${error.message} Refresh groups before continuing.` };
    }
  }
  return {applied};
}
