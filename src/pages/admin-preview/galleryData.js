import { readAll } from './playersData.js';
import { verifyPublishingAccess } from './publishingAccess.js';
import { SUPER_ADMIN_EMAILS } from '../../utils/adminIdentity.js';
export const GALLERY_FIELDS = ['title', 'description', 'is_active', 'cover_image_url', 'event_id', 'organisation_id', 'youtube_playlist_url', 'slug', 'photographer_name', 'photographer_instagram', 'album_date', 'is_featured', 'parent_album_id'];
export function canReadGallery(session, permissions, scopeId) {
  return !!session?.user?.id && scopeId === 'all' && (SUPER_ADMIN_EMAILS.includes(String(session.user.email || '').trim().toLowerCase()) || permissions?.role === 'super_admin' || permissions?.allowed_tabs?.includes('gallery') || !!permissions?.module_permissions?.gallery?.allowedAlbums?.length);
}
export function permittedAlbumIds(permissions) {
  const ids = permissions?.module_permissions?.gallery?.allowedAlbums;
  return permissions?.role !== 'super_admin' && Array.isArray(ids) && ids.length ? ids : null;
}
export const verifyGalleryAccess = (client, session, scopeId, signal) => verifyPublishingAccess(client, scopeId, session?.user?.id, 'gallery', signal);
export async function loadGallery(client, session, scopeId, signal) {
  const grant = await verifyGalleryAccess(client, session, scopeId, signal),
    ids = permittedAlbumIds(grant);
  const albums = await readAll(() => {
    let q = client.from('albums').select('*,calendar(event_name),organisations(name,slug)').order('created_at', {
      ascending: false
    }).order('id');
    return ids ? q.in('id', ids) : q;
  }, signal);
  const [events, organisations] = await Promise.all([readAll(() => client.from('calendar').select('id,event_name,start_date').order('start_date', {
    ascending: false
  }).order('id'), signal), readAll(() => client.from('organisations').select('id,name,slug,status').eq('status', 'approved').order('name').order('id'), signal)]);
  return {
    albums: albums.filter(album => !ids || ids.some(id => String(id) === String(album.id))),
    events,
    organisations,
    grant
  };
}
export async function loadGalleryPhotos(client, session, scopeId, albumId, signal) {
  const grant = await verifyGalleryAccess(client, session, scopeId, signal),
    ids = permittedAlbumIds(grant);
  if (ids && !ids.some(id => String(id) === String(albumId))) throw new Error('You do not have access to this album.');
  return readAll(() => client.from('gallery_images').select('*').eq('album_id', albumId).order('sort_order', {
    ascending: true
  }).order('created_at', {
    ascending: false
  }).order('id'), signal);
}
export function galleryAlbumDraft(album = {}) {
  album = album || {};
  return Object.fromEntries(GALLERY_FIELDS.map(key => [key, key === 'is_active' ? album[key] ?? true : key === 'is_featured' ? album[key] ?? false : key === 'album_date' ? (album[key] || '').slice(0, 10) : album[key] ?? '']));
}
export function galleryAlbumPayload(draft) {
  if (!String(draft.title || '').trim()) throw new Error('Album title is required.');
  return Object.fromEntries(GALLERY_FIELDS.map(key => [key, ['event_id', 'organisation_id', 'parent_album_id', 'album_date'].includes(key) && draft[key] === '' ? null : draft[key]]));
}
export function gallerySlug(text) {
  return String(text).toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w-]+/g, '').replace(/--+/g, '-').replace(/^-+|-+$/g, '');
}
export function galleryFolder(title) {
  return (title || 'unnamed-album').toLowerCase().trim().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}
export function galleryImageUrl(value, local = false) {
  if (local && String(value).startsWith('blob:')) return value;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}
export function filterGallery(albums, {
  query = '',
  status = '',
  organisation = '',
  parent = ''
} = {}) {
  const q = query.trim().toLowerCase();
  return albums.filter(a => (!q || [a.title, a.description, a.photographer_name, a.calendar?.event_name, a.organisations?.name].some(value => String(value || '').toLowerCase().includes(q))) && (!status || (status === 'active' ? a.is_active : !a.is_active)) && (!organisation || String(a.organisation_id) === organisation) && (!parent || (parent === 'top' ? !a.parent_album_id : String(a.parent_album_id) === parent))).sort((a, b) => Number(!!b.is_featured) - Number(!!a.is_featured) || String(b.created_at || '').localeCompare(String(a.created_at || '')));
}
// Drafts are browser-only. There are deliberately no storage/database mutations
// here: source deletion/upload spans several non-atomic operations.
export function prepareGalleryFiles(files, album, photos, makeUrl = URL.createObjectURL.bind(URL)) {
  const base = Number(photos.at(-1)?.sort_order) || 0;
  if (Array.from(files).some(file => !file.type.startsWith('image/'))) throw new Error('Choose image files only.');
  return Array.from(files).map((file, i) => {
    if (!file.type.startsWith('image/')) throw new Error('Choose image files only.');
    return {
      id: `local-photo-${crypto.randomUUID()}`,
      album_id: album.id,
      image_url: makeUrl(file),
      thumbnail_url: null,
      sort_order: base + i + 1,
      file,
      local: true
    };
  });
}
