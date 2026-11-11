import { supabase } from './supabase';

export const PUBLIC_CLUB_STATUSES = ['published', '4m_approved', '4m_premium'] as const;
const GROUP_FIELDS = 'id,name,slug,short_name,status,logo_url,website_url,share_logo,share_website';
const FIELDS = `id,name,short_name,slug,status,logo_url,cover_image_url,city,province,country,address,lat,lng,courts,group_id,club_groups(${GROUP_FIELDS})`;
const DETAIL_FIELDS = `${FIELDS},tagline,about,services,opening_hours,website_url,contact_phone,contact_email,whatsapp_number,socials,gallery,stats,cafe,google_maps_url,google_place_id,google_rating,google_ratings_total,google_synced_at`;
export type Coordinate = { latitude: number; longitude: number };
export type ClubGroup = { id: string; name: string; slug: string; shortName: string; logo: string | null; website: string | null; shareLogo: boolean; shareWebsite: boolean; about?: string; city?: string; province?: string };
export type Club = { group: ClubGroup | null; groupId: string | null; shortName: string; id: string; slug: string; name: string; status: string; logo: string | null; cover: string | null; city: string; province: string; country: string; address: string; coordinate: Coordinate | null; indoor: number | null; outdoor: number | null };
export type ClubDetails = Club & { tagline: string; about: string; facilities: string[]; facilityDetails: { title: string; description: string }[]; hours: { day: string; label: string }[]; hoursNotes: string; access247: boolean; website: string | null; phone: string | null; email: string | null; whatsapp: string | null; socials: { label: string; url: string }[]; gallery: { url: string; caption: string; category: string }[]; courtDetails: { label: string; count: number | null; features: string[]; image: string | null }[]; surface: string; lighting: string; totalCourts: number | null; googlePlaceId: string | null; googleUrl: string | null; googleRating: number | null; googleReviews: number | null; googleUpdated: string | null };
export type ClubEvent = { id: number; slug: string | null; name: string; start: string; end: string; image: string | null; status: string | null };
export type ClubOrganisation = { id: string; name: string; logo: string | null; type: string };
export type ClubCoach = { id: string; name: string; logo: string | null; city: string };
export type ClubCommunity = { players: number | null; team: { id: number; name: string; photo: string | null; role: string }[] };
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const count = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
export function publicPhoto(value: unknown): string | null {
  try { const url = new URL(text(value)); return url.protocol === 'https:' ? url.href : null; } catch { return null; }
}
export function publicUrl(value: unknown): string | null {
  try { const url = new URL(text(value)); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
export function parseClubGroup(value: unknown): ClubGroup | null {
  const row = object(Array.isArray(value) ? value[0] : value);
  if (!PUBLIC_CLUB_STATUSES.includes(row.status as typeof PUBLIC_CLUB_STATUSES[number]) || !text(row.id) || !text(row.name) || !text(row.slug)) return null;
  return { id: text(row.id), name: text(row.name), slug: text(row.slug), shortName: text(row.short_name), logo: publicPhoto(row.logo_url), website: publicUrl(row.website_url), shareLogo: row.share_logo === true, shareWebsite: row.share_website === true, about: text(row.about).replace(/<[^>]*>/g, ''), city: text(row.city), province: text(row.province) };
}
export function coordinate(latitude: unknown, longitude: unknown): Coordinate | null {
  return typeof latitude === 'number' && typeof longitude === 'number' && Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? { latitude, longitude } : null;
}
export function parseClub(row: Record<string, unknown>): Club | null {
  if (!PUBLIC_CLUB_STATUSES.includes(row.status as typeof PUBLIC_CLUB_STATUSES[number]) || !text(row.id) || !text(row.name) || !text(row.slug)) return null;
  const courts = object(row.courts), group = parseClubGroup(row.club_groups);
  return { group, groupId: text(row.group_id) || group?.id || null, shortName: text(row.short_name), id: text(row.id), name: text(row.name), slug: text(row.slug), status: text(row.status), logo: group?.shareLogo && group.logo ? group.logo : publicPhoto(row.logo_url), cover: publicPhoto(row.cover_image_url), city: text(row.city), province: text(row.province), country: text(row.country), address: text(row.address), coordinate: coordinate(row.lat, row.lng), indoor: count(object(courts.indoor).count), outdoor: count(object(courts.outdoor).count) };
}
export function clubLocation(club: Club) { return [club.city, club.province].filter(Boolean).join(' · ') || club.country || 'Location not listed'; }
export function clubCourts(club: Club) {
  if (club.indoor === null && club.outdoor === null) return null;
  return [club.indoor ? `${club.indoor} indoor` : '', club.outdoor ? `${club.outdoor} outdoor` : ''].filter(Boolean).join(' · ') || null;
}
export function distanceKm(a: Coordinate, z: Coordinate): number {
  const rad = (n: number) => n * Math.PI / 180;
  const h = Math.sin(rad(z.latitude - a.latitude) / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(z.latitude)) * Math.sin(rad(z.longitude - a.longitude) / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
/** Nearby is a device-side straight-line distance, never a travel estimate. */
export function filterClubs(clubs: Club[], query: string, origin: Coordinate | null, radius: number) {
  const term = normalized(query.trim());
  return clubs.filter(club => normalized([club.name, club.shortName, club.city, club.province, club.address, club.group?.name || '', club.group?.shortName || ''].join(' ')).includes(term))
    .map(club => ({ club, distance: origin && club.coordinate ? distanceKm(origin, club.coordinate) : null }))
    .filter(row => !origin || row.distance !== null && row.distance <= radius)
    .sort((a, z) => origin ? a.distance! - z.distance! || a.club.name.localeCompare(z.club.name) : a.club.name.localeCompare(z.club.name));
}
let cache: { expires: number; clubs: Club[] } | null = null;
export async function fetchClubs(signal?: AbortSignal, fresh = false): Promise<Club[]> {
  if (!fresh && cache && cache.expires > Date.now()) return cache.clubs;
  const rows: Club[] = [];
  for (let from = 0; ; from += 250) {
    let request = supabase.from('clubs').select(FIELDS).in('status', [...PUBLIC_CLUB_STATUSES]).order('name').order('id').range(from, from + 249);
    if (signal) request = request.abortSignal(signal);
    const { data, error } = await request;
    if (error) throw error;
    if (signal?.aborted) throw new Error('Cancelled');
    for (const row of data ?? []) { const club = parseClub(row); if (club) rows.push(club); }
    if (!data || data.length < 250) break;
  }
  const clubs = [...new Map(rows.map(club => [club.id, club])).values()];
  cache = { clubs, expires: Date.now() + 5 * 60_000 };
  return clubs;
}
export async function fetchClub(slug: string, signal?: AbortSignal): Promise<ClubDetails | null> {
  if (!slug.trim() || slug.length > 200) return null;
  let request = supabase.from('clubs').select(DETAIL_FIELDS).eq('slug', slug).in('status', [...PUBLIC_CLUB_STATUSES]);
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request.maybeSingle();
  if (error) throw error;
  const club = data && parseClub(data);
  if (!club) return null;
  const hours = object(data.opening_hours);
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const courts = object(data.courts), cafe = object(data.cafe), stats = object(data.stats), socials = object(data.socials);
  const facilityDetails = (Array.isArray(data.services) ? data.services : []).flatMap((item: unknown) => { const row = object(item); return text(row.title) ? [{ title: text(row.title), description: text(row.description) }] : []; });
  if (text(cafe.name)) facilityDetails.push({ title: text(cafe.name), description: text(cafe.description) });
  const phone = text(data.contact_phone), email = text(data.contact_email), whatsapp = text(data.whatsapp_number).replace(/[^0-9]/g, '').replace(/^0/, '27');
  const placeId = text(data.google_place_id);
  const rating = Number(data.google_rating);
  return { ...club, tagline: text(data.tagline), about: text(data.about).replace(/<[^>]*>/g, '').slice(0, 8000),
    facilities: facilityDetails.map(item => item.title), facilityDetails,
    hours: days.flatMap(day => { const value = object(hours[day] ?? hours[day.slice(0, 3)]); const label = value.closed === true ? 'Closed' : text(value.open) && text(value.close) ? `${text(value.open)} – ${text(value.close)}` : ''; return label ? [{ day: day[0].toUpperCase() + day.slice(1), label }] : []; }),
    hoursNotes: text(hours.notes), access247: hours.access_247 === true,
    website: club.group?.shareWebsite && club.group.website ? club.group.website : publicUrl(data.website_url),
    phone: /^\+?[0-9 ().-]{6,30}$/.test(phone) ? phone : null,
    email: /^[^\s@?]+@[^\s@?]+\.[^\s@?]+$/.test(email) ? email : null,
    whatsapp: /^\d{7,15}$/.test(whatsapp) ? `https://wa.me/${whatsapp}` : null,
    socials: [['Instagram','instagram'],['Facebook','facebook'],['TikTok','tiktok'],['Playtomic','playtomic']].flatMap(([label,key]) => { const url = publicUrl(socials[key]); return url ? [{ label, url }] : []; }),
    gallery: (Array.isArray(data.gallery) ? data.gallery : []).flatMap((item: unknown) => { const row = object(item), url = publicPhoto(row.url); return url ? [{ url, caption: text(row.caption), category: text(row.category) }] : []; }),
    courtDetails: ['indoor','outdoor'].flatMap(key => { const row = object(courts[key]), features = Array.isArray(row.features) ? row.features.map(text).filter(Boolean) : [], image = publicPhoto(row.image_url), value = count(row.count); return value || features.length || image ? [{ label: key === 'indoor' ? 'Indoor courts' : 'Outdoor courts', count: value, features, image }] : []; }),
    surface: text(courts.surface), lighting: text(courts.lighting), totalCourts: count(stats.courts) || (club.indoor || 0) + (club.outdoor || 0) || null,
    googlePlaceId: placeId || null, googleUrl: publicUrl(data.google_maps_url) || (placeId ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(club.name)}&query_place_id=${encodeURIComponent(placeId)}` : null),
    googleRating: Number.isFinite(rating) && rating > 0 && rating <= 5 ? rating : null,
    googleReviews: count(data.google_ratings_total), googleUpdated: text(data.google_synced_at) || null,
  };

}
/** Only the chosen public club location is passed to the platform maps app. */
export function clubDirectionsUrl(club: Club, platform: string): string | null {
  if (!club.coordinate && !club.address) return null;
  const label = encodeURIComponent([club.name, club.address, club.city].filter(Boolean).join(', '));
  const point = club.coordinate ? `${club.coordinate.latitude},${club.coordinate.longitude}` : '';
  return platform === 'ios' ? `https://maps.apple.com/?q=${label}${point ? `&ll=${point}` : ''}` : platform === 'android' ? `geo:${point || '0,0'}?q=${point ? `${point}(${encodeURIComponent(club.name)})` : label}` : `https://www.google.com/maps/search/?api=1&query=${point || label}`;
}

let groupCache: { expires: number; groups: ClubGroup[] } | null = null;
export async function fetchClubGroups(signal?: AbortSignal, fresh = false): Promise<ClubGroup[]> {
  if (!fresh && groupCache && groupCache.expires > Date.now()) return groupCache.groups;
  const groups: ClubGroup[] = [];
  for (let from = 0; ; from += 250) {
    let query = supabase.from('club_groups').select(GROUP_FIELDS).in('status', [...PUBLIC_CLUB_STATUSES]).order('name').order('id').range(from, from + 249);
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error) throw error;
    if (signal?.aborted) throw new Error('Cancelled');
    for (const row of data ?? []) { const group = parseClubGroup(row); if (group) groups.push(group); }
    if (!data || data.length < 250) {
      groupCache = { groups, expires: Date.now() + 5 * 60_000 };
      return groups;
    }
  }
}
export function filterClubGroups(groups: ClubGroup[], query: string) {
  const term = normalized(query);
  return groups.filter(group => normalized([group.name, group.shortName, group.city, group.province].filter(Boolean).join(' ')).includes(term));
}
export async function fetchClubGroup(slug: string, signal?: AbortSignal): Promise<ClubGroup | null> {
  let query = supabase.from('club_groups').select(`${GROUP_FIELDS},about,city,province`).eq('slug', slug).in('status', [...PUBLIC_CLUB_STATUSES]);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query.maybeSingle(); if (error) throw error;
  return parseClubGroup(data);
}
export async function fetchGroupVenues(groupId: string, signal?: AbortSignal): Promise<Club[]> {
  let query = supabase.from('clubs').select(FIELDS).eq('group_id', groupId).in('status', [...PUBLIC_CLUB_STATUSES]).order('name');
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query; if (error) throw error;
  return (data ?? []).flatMap(row => { const club = parseClub(row); return club ? [club] : []; });
}
/** Same public venue-name association as the website. No player/registration queries. */
export function eventMatchesClub(event: { venue?: unknown; venues?: unknown }, club: Club) {
  const names = [club.name, club.shortName].map(normalized).filter(Boolean);
  const venues = [...(Array.isArray(event.venues) ? event.venues.filter((item): item is string => typeof item === 'string') : []), text(event.venue)].map(normalized).filter(Boolean);
  return names.some(name => venues.some(venue => name === venue || name.includes(venue) || venue.includes(name)));
}
export async function fetchClubEvents(club: Club, signal?: AbortSignal): Promise<ClubEvent[]> {
  let query = supabase.from('calendar').select('id,slug,event_name,start_date,end_date,venue,venues,image_url,custom_image_url,poster_image_url,sapa_status').or('sanction_status.eq.approved,sanction_status.is.null').neq('is_visible', false).order('start_date', { ascending: false }).limit(200);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query; if (error) throw error;
  return (data ?? []).filter(row => eventMatchesClub(row, club)).map(row => ({ id: Number(row.id), slug: text(row.slug) || null, name: text(row.event_name), start: text(row.start_date), end: text(row.end_date), image: publicPhoto(row.custom_image_url) || publicPhoto(row.poster_image_url) || publicPhoto(row.image_url), status: text(row.sapa_status) || null }));
}
export async function fetchClubOrganisations(clubId: string, signal?: AbortSignal): Promise<ClubOrganisation[]> {
  let query = supabase.from('club_organisations').select('organisations(id,name,logo_url,org_type,status)').eq('club_id', clubId);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query; if (error) throw error;
  return (data ?? []).flatMap(row => { const org = object(Array.isArray(row.organisations) ? row.organisations[0] : row.organisations); return org.status === 'approved' && text(org.id) && text(org.name) ? [{ id: text(org.id), name: text(org.name), logo: publicPhoto(org.logo_url), type: text(org.org_type) }] : []; });
}
/** Same approved coach directory as the website, without application/contact fields. */
export async function fetchClubCoaches(club: Club, signal?: AbortSignal): Promise<ClubCoach[]> {
  let query = supabase.from('coach_applications').select('id,full_name,profile_pic_url,coaching_location,city,status').eq('status', 'approved').limit(80);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query; if (error) throw error;
  const names = [club.name, club.shortName].map(normalized).filter(Boolean);
  return (data ?? []).filter(row => row.status === 'approved' && names.some(name => normalized(text(row.coaching_location)).includes(name))).slice(0, 8).map(row => ({ id: String(row.id), name: text(row.full_name), logo: publicPhoto(row.profile_pic_url), city: text(row.city) }));
}
export async function fetchClubCommunity(clubId: string, signal: AbortSignal): Promise<ClubCommunity> {
  const [population, membership] = await Promise.all([
    supabase.from('players_public').select('id', { count: 'exact', head: true }).eq('club_id', clubId).abortSignal(signal),
    supabase.from('club_members_public').select('role,player_id').eq('club_id', clubId).in('role', ['owner', 'admin', 'staff']).limit(12).abortSignal(signal),
  ]);
  if (population.error || membership.error) throw population.error || membership.error;
  const members = (membership.data ?? []).filter(row => ['owner', 'admin', 'staff'].includes(row.role) && Number.isSafeInteger(Number(row.player_id)) && Number(row.player_id) > 0);
  const ids = [...new Set(members.map(row => Number(row.player_id)))];
  const result = ids.length ? await supabase.from('players_public').select('id,name,image_url').in('id', ids).abortSignal(signal) : { data: [], error: null };
  if (result.error) throw result.error;
  return { players: typeof population.count === 'number' ? population.count : null, team: members.flatMap(member => {
    const player = result.data?.find(row => Number(row.id) === Number(member.player_id));
    return player && text(player.name) ? [{ id: Number(player.id), name: text(player.name), photo: publicPhoto(player.image_url), role: member.role }] : [];
  }) };
}
