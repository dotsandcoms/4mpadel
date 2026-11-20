import { verifyClubCreationAccess } from './clubCreation.js';

// Mappings mirror CURRENT MAIN ClubManager emptyForm, hydration and handleSave.
// No creation, membership, organisation-link, claim or approval-email side effects.
const clone = value => structuredClone(value);
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const same = (a, b) => JSON.stringify(canonical(a ?? null)) === JSON.stringify(canonical(b ?? null));
const statusValue = value => { const raw = String(value || '').trim().toLowerCase(); return raw === 'pending' ? 'in_review' : ['draft', 'archived'].includes(raw) ? 'unclaimed' : raw || 'unclaimed'; };
const slug = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
const socials = value => Object.fromEntries(['instagram', 'facebook', 'tiktok', 'playtomic'].map(key => [key, value?.[key] || '']));
const courts = value => Object.fromEntries(['indoor', 'outdoor'].map(side => [side, { count: Number(value?.[side]?.count) || 0, features: Array.isArray(value?.[side]?.features) ? clone(value[side].features) : [], image_url: value?.[side]?.image_url || '' }]));
const hours = () => Object.fromEntries(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((day, i) => [day, { open: i < 5 ? '06:00' : '07:00', close: i < 5 ? '22:00' : i === 5 ? '21:00' : '20:00', closed: false }]));
const defaults = () => ({ name: '', short_name: '', slug: '', about: '', website_url: '', brand_color: '#CC1414', status: 'unclaimed', contact_email: '', contact_phone: '', whatsapp_number: '', city: '', address: '', lat: '', lng: '', logo_url: '', cover_image_url: '', verified: false, sapa_registered: false, federation_id: '', group_id: '', socials: socials(), contacts: [], opening_hours: hours(), courts: courts(), services: [], cafe: null, sponsors: [], principal_sponsor: null, gallery: [], stats: {} });
export const FULL_CLUB_FIELDS = Object.keys(defaults());
const platformFields = new Set(['slug', 'status', 'verified', 'sapa_registered', 'federation_id', 'group_id']);
export function createFullClubDraft(record) {
  return clone({ ...defaults(), ...record, status: statusValue(record.status), lat: record.lat ?? '', lng: record.lng ?? '', federation_id: record.federation_id || '', group_id: record.group_id || '', socials: socials(record.socials), contacts: Array.isArray(record.contacts) ? record.contacts : [], opening_hours: { ...hours(), ...(record.opening_hours || {}) }, courts: courts(record.courts), services: Array.isArray(record.services) ? record.services : [], cafe: record.cafe || null, sponsors: Array.isArray(record.sponsors) ? record.sponsors : [], principal_sponsor: record.principal_sponsor || null, gallery: Array.isArray(record.gallery) ? record.gallery : [], stats: record.stats && typeof record.stats === 'object' ? record.stats : {} });
}
export function fullClubProfilePatch(original, draft, groups = [], { scoped = false } = {}) {
  if (!original?.id) throw new Error('Select an existing club.');
  if (!String(draft.name || '').trim()) throw new Error('Name is required.');
  if (!scoped && !String(draft.slug || '').trim()) throw new Error('Page slug is required.');
  const base = createFullClubDraft(original), patch = {};
  const changed = key => Object.hasOwn(draft, key) && !same(draft[key], base[key]);
  for (const key of FULL_CLUB_FIELDS) {
    if (!changed(key)) continue;
    if (scoped && platformFields.has(key)) throw new Error('Platform club settings require a platform administrator.');
    const value = draft[key];
    if (['name', 'short_name'].includes(key)) patch[key] = String(value || '').trim() || null;
    else if (key === 'slug') { patch.slug = slug(value); if (!patch.slug) throw new Error('Enter a valid page URL slug.'); }
    else if (key === 'status') patch.status = statusValue(value);
    else if (['lat', 'lng'].includes(key)) { patch[key] = value === '' || value == null ? null : Number(value); if (patch[key] !== null && !Number.isFinite(patch[key])) throw new Error('Coordinates must be valid numbers.'); }
    else if (['verified', 'sapa_registered'].includes(key)) patch[key] = !!value;
    else if (key === 'socials') patch.socials = socials(value);
    else if (key === 'courts') patch.courts = courts(value);
    else if (['contacts', 'services', 'sponsors', 'gallery'].includes(key)) patch[key] = Array.isArray(value) ? clone(value) : [];
    else if (key === 'opening_hours') patch[key] = clone(value || hours());
    else if (key === 'stats') patch.stats = clone(value || {});
    else patch[key] = clone(value || null);
  }
  const group = groups.find(value => String(value.id) === String(draft.group_id));
  if (draft.group_id && !group) throw new Error('Selected club group is unavailable. Reopen the editor.');
  // Live ClubManager enforces shared branding on every save. Include the
  // resulting changes in the review patch even when the group was not edited.
  for (const [field, flag] of [['website_url', 'share_website'], ['logo_url', 'share_logo']]) {
    if (group?.[flag] && group[field]) patch[field] = group[field];
  }
  return Object.fromEntries(Object.entries(patch).filter(([key, value]) => !same(value, original[key])));
}
async function authority(client, scopeId, clubId, expectedUserId) {
  if (!expectedUserId) throw new Error('Sign in before editing a club.');
  if (scopeId === 'all') return verifyClubCreationAccess(client, scopeId, expectedUserId);
  if (!clubId || scopeId !== `club:${clubId}`) throw new Error('Choose the matching club workspace.');
  const { data, error } = await client.auth.getUser();
  if (error || data?.user?.id !== expectedUserId || !data.user.email) throw new Error('The signed-in account changed. Reopen the club.');
  const [active, allowed] = await Promise.all([client.rpc('account_is_active'), client.rpc('can_manage_club', { p_club_id: clubId })]);
  if (active.error || active.data !== true || allowed.error || allowed.data !== true) throw new Error('Current permission to manage this club is required.');
  const actor = await client.auth.getUser();
  if (actor.error || actor.data?.user?.id !== expectedUserId || actor.data.user.email !== data.user.email) throw new Error('The signed-in account changed. Reopen the club.');
}
async function pages(makeQuery) {
  const rows = [];
  for (let offset = 0; ; offset += 500) { const { data, error } = await makeQuery().range(offset, offset + 499); if (error || !Array.isArray(data)) throw new Error('Club editor options could not be loaded.'); rows.push(...data); if (data.length < 500) return rows; }
}
async function record(client, id, fields = '*') {
  const { data, error } = await client.from('clubs').select(fields).eq('id', id).single();
  if (error || !data || String(data.id) !== String(id)) throw new Error('The club could not be loaded.');
  return data;
}
const loadGroups = (client, scopeId, groupId) => {
  if (scopeId !== 'all' && !groupId) return [];
  return pages(() => {
    const query = client.from('club_groups').select('id,name,slug,short_name,logo_url,status,share_logo,share_website,website_url').order('name').order('id');
    return scopeId === 'all' ? query : query.eq('id', groupId);
  });
};
export async function loadFullClubEditor(client, scopeId, clubId, expectedUserId) {
  await authority(client, scopeId, clubId, expectedUserId);
  const current = await record(client, clubId);
  const scoped = scopeId !== 'all';
  const [groups, federations] = await Promise.all([loadGroups(client, scopeId, current.group_id),
    scoped ? [] : pages(() => client.from('federations').select('id,name,short_name,slug').order('name').order('id'))]);
  return { record: current, groups, federations, scoped };
}
async function verifyRecord(client, scopeId, original, expectedUserId) {
  if (!original?.id) throw new Error('Select an existing club.');
  await authority(client, scopeId, original.id, expectedUserId);
  const fresh = await record(client, original.id);
  if ([...FULL_CLUB_FIELDS, 'updated_at'].some(key => !same(original[key], fresh[key]))) throw new Error('Club details changed since opening. Reopen before saving.');
  return fresh;
}
export async function saveFullClubProfile({ client, scopeId, expectedUserId, original, draft, groups = [] }) {
  const fresh = await verifyRecord(client, scopeId, original, expectedUserId);
  const refreshed = await loadGroups(client, scopeId, fresh.group_id);
  for (const id of [original.group_id, draft.group_id].filter(Boolean)) {
    const before = groups.find(group => String(group.id) === String(id)), after = refreshed.find(group => String(group.id) === String(id));
    if (!before || !after || !same(before, after)) throw new Error('Club group settings changed or are unavailable. Reopen to review inherited branding.');
  }
  const patch = fullClubProfilePatch(original, draft, refreshed, { scoped: scopeId !== 'all' });
  if (!Object.keys(patch).length) return { changed: false, record: fresh };
  return await writeClubProfilePatch(client, scopeId, expectedUserId, original, patch);
}
async function writeClubProfilePatch(client, scopeId, expectedUserId, original, patch, fields = '*') {
  await authority(client, scopeId, original.id, expectedUserId);
  const updatedAt = new Date().toISOString();
  let query = client.from('clubs').update({ ...patch, updated_at: updatedAt }).eq('id', original.id);
  for (const key of new Set(['updated_at', ...Object.keys(patch)])) {
    const value = original[key];
    query = value == null ? query.is(key, null) : query.eq(key, typeof value === 'object' ? JSON.stringify(value) : value);
  }
  const { data, error } = await query.select(fields).single();
  if (error || !data || String(data.id) !== String(original.id)) {
    throw new Error('Club save could not be confirmed. Reopen before retrying.');
  }
  return { changed: true, record: data };
}

const cityFields = 'id,name,city,updated_at';

export async function loadClubCityEditor(client, scopeId, clubId, expectedUserId) {
  await authority(client, scopeId, clubId, expectedUserId);
  return await record(client, clubId, cityFields);
}

export function clubCityPatch(original, value) {
  const city = value.trim() || null;
  return same(city, original.city) ? {} : { city };
}

export async function saveClubCity({ client, scopeId, expectedUserId, original, city }) {
  if (!original?.id) throw new Error('Select an existing club.');
  const fresh = await loadClubCityEditor(client, scopeId, original.id, expectedUserId);
  if (['name', 'city', 'updated_at'].some(key => !same(original[key], fresh[key]))) {
    throw new Error('Club details changed since opening. Reopen before saving.');
  }
  const patch = clubCityPatch(original, city);
  if (!Object.keys(patch).length) return { changed: false, record: fresh };
  return await writeClubProfilePatch(client, scopeId, expectedUserId, original, patch, cityFields);
}

export async function uploadFullClubImage({ client, scopeId, expectedUserId, original, file, kind }) {
  if (!['logo', 'cover', 'gallery', 'indoor', 'outdoor', 'cafe', 'principal'].includes(kind)) throw new Error('Unknown club image type.');
  if (!file?.type?.startsWith('image/') || !file.size) throw new Error('Choose a non-empty image.');
  await verifyRecord(client, scopeId, original, expectedUserId);
  const extension = String(file.name?.split('.').pop() || 'jpg').toLowerCase();
  if (!/^[a-z0-9]{1,8}$/.test(extension) || !/^[a-zA-Z0-9_-]+$/.test(String(original.id))) throw new Error('Invalid image filename or club identifier.');
  const path = `clubs/${kind}/${original.id}_${Date.now()}_${crypto.randomUUID()}.${extension}`;
  const bucket = client.storage.from('profile-pics');
  const { error } = await bucket.upload(path, file, { upsert: false });
  if (error) throw new Error('Club image upload failed.');
  const { data, error: urlError } = bucket.getPublicUrl(path);
  if (urlError || !data?.publicUrl) throw new Error('Image uploaded but its URL could not be confirmed. No club record was changed.');
  return data.publicUrl;
}
