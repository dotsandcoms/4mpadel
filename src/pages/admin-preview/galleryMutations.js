import { verifyGalleryAccess, permittedAlbumIds, galleryAlbumPayload, GALLERY_FIELDS } from './galleryData.js';
import { readAll } from './playersData.js';

export const isGalleryWriteEnabled = client => typeof client?.auth?.getUser === 'function'
  && typeof client?.rpc === 'function' && typeof client?.from === 'function';
const albumIdPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const ALBUM_COLUMNS = ['id', ...GALLERY_FIELDS, 'updated_at'];
const PHOTO_COLUMNS = ['id', 'album_id', 'image_url', 'thumbnail_url', 'caption', 'sort_order', 'created_at'];
const sameFields = (left, right, fields) => fields.every(key => JSON.stringify(left?.[key] ?? null) === JSON.stringify(right?.[key] ?? null));
function gate({ client, isCurrent = () => true }) {
  if (!isGalleryWriteEnabled(client)) throw new Error('Sign in to use Gallery changes.');
  if (!isCurrent()) throw new Error('The gallery account or album changed. Review again.');
}
async function access(options, albumId, albumManagement = false) {
  gate(options);
  const { client, session } = options;
  const grant = await verifyGalleryAccess(client, session, options.scopeId ?? 'all');
  const { data: active, error: activeError } = await client.rpc('account_is_active');
  const { data: actor, error: actorError } = await client.auth.getUser();
  gate(options);
  const email = String(session?.user?.email || '').trim().toLowerCase();
  if (activeError || active !== true || actorError || actor?.user?.id !== session?.user?.id
    || !email || grant.email !== email || String(actor.user.email || '').trim().toLowerCase() !== email) {
    throw new Error('An active account with current Gallery access is required.');
  }
  const ids = permittedAlbumIds(grant);
  if (ids && (albumManagement || !ids.some(id => String(id) === String(albumId)))) throw new Error('Your album assignment does not allow this gallery action.');
  return grant;
}
async function currentAlbum(options, album, albumManagement = false) {
  if (!album?.id || album.local) throw new Error('Select a saved album before changing its photos.');
  await access(options, album.id, albumManagement);
  const { data, error } = await options.client.from('albums').select(ALBUM_COLUMNS.join(',')).eq('id', album.id).single();
  gate(options);
  if (error || !data || !sameFields(data, album, ALBUM_COLUMNS)) throw new Error('The album changed. Reload it before continuing.');
  return data;
}
function originalPredicate(query, original, fields) {
  for (const key of fields) query = original[key] == null ? query.is(key, null) : query.eq(key, original[key]);
  return query;
}
function complete(data, error, message) {
  if (error) throw new Error(error.message || message);
  if (!data) throw new Error(`${message} The original record changed or is no longer available.`);
  return data;
}
export async function saveGalleryAlbum(options) {
  const { client, original, draft } = options, payload = galleryAlbumPayload(draft);
  if (original) {
    await currentAlbum(options, original, true);
    let query = client.from('albums').update(payload).eq('id', original.id);
    query = originalPredicate(query, original, [...GALLERY_FIELDS, 'updated_at']);
    gate(options);
    const { data, error } = await query.select('*').maybeSingle();
    return complete(data, error, 'Album could not be saved.');
  }
  await access(options, null, true);
  gate(options);
  // Caller retains this UUID on an uncertain response and reloads before retrying.
  if (!options.operationId) throw new Error('Review the new album before saving.');
  const { data, error } = await client.from('albums').insert({ ...payload, id: options.operationId }).select('*').single();
  return complete(data, error, 'Album could not be created.');
}
export async function setGalleryVisibility(options, visible) {
  if (typeof visible !== 'boolean') throw new Error('Choose a valid album visibility.');
  const album = await currentAlbum(options, options.album, true);
  let query = options.client.from('albums').update({ is_active: visible }).eq('id', album.id);
  query = originalPredicate(query, album, [...GALLERY_FIELDS, 'updated_at']);
  gate(options);
  const { data, error } = await query.select('*').maybeSingle();
  return complete(data, error, 'Album visibility could not be updated.');
}
export async function removeGalleryAlbum(options) {
  const album = await currentAlbum(options, options.album, true);
  let query = options.client.from('albums').delete().eq('id', album.id);
  query = originalPredicate(query, album, [...GALLERY_FIELDS, 'updated_at']); gate(options);
  const { data, error } = await query.select('id').maybeSingle();
  complete(data, error, 'Album could not be removed.');
  // Preserve original assets. The source album delete also leaves storage files.
  return { album_id: album.id, retained_storage: true };
}
export async function setGalleryCover(options) {
  const album = await currentAlbum(options, options.album);
  const { data: photo, error: photoError } = await options.client.from('gallery_images').select(PHOTO_COLUMNS.join(',')).eq('album_id', album.id).eq('id', options.photo?.id).single();
  gate(options);
  if (photoError || !photo || !sameFields(photo, options.photo, PHOTO_COLUMNS)) throw new Error('The selected photo changed. Reload before setting its cover.');
  let query = options.client.from('albums').update({ cover_image_url: photo.image_url }).eq('id', album.id);
  query = originalPredicate(query, album, [...GALLERY_FIELDS, 'updated_at']);
  const { data, error } = await query.select('*').maybeSingle();
  return complete(data, error, 'Cover could not be saved.');
}
export async function removeGalleryPhotos(options) {
  const album = await currentAlbum(options, options.album);
  const photos = structuredClone(options.photos || []);
  if (!photos.length || new Set(photos.map(p => p.id)).size !== photos.length || photos.some(p => !p.id || p.album_id !== album.id || p.local)) throw new Error('Select saved photos from this album.');
  const ids = photos.map(p => p.id), fresh = [];
  for (let i = 0; i < ids.length; i += 50) fresh.push(...await readAll(() => options.client.from('gallery_images').select(PHOTO_COLUMNS.join(',')).eq('album_id', album.id).in('id', ids.slice(i, i + 50)).order('id')));
  gate(options);
  if (fresh.length !== photos.length || photos.some(p => !fresh.some(row => row.id === p.id && sameFields(row, p, PHOTO_COLUMNS)))) throw new Error('Selected photos changed. Reload before removing them.');
  const removed = [];
  try {
    for (const photo of photos) {
      gate(options);
      let query = options.client.from('gallery_images').delete().eq('id', photo.id).eq('album_id', album.id);
      query = originalPredicate(query, photo, PHOTO_COLUMNS.filter(key => !['id', 'album_id'].includes(key)));
      const { data, error } = await query.select('id').maybeSingle();
      complete(data, error, 'Photo could not be removed.'); removed.push(photo.id);
    }
    return { removed_ids: removed, retained_storage: true };
  } catch (error) {
    error.removed_ids = removed; error.retained_storage = true;
    throw error;
  }
}

// Same resizing rules as GalleryManager; decoding/toBlob failures now reject.
export function resizeGalleryPhoto(file, maxWidth, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The image could not be read.'));
    reader.onload = () => {
      const img = new Image(); img.onerror = () => reject(new Error('The image could not be decoded.'));
      img.onload = () => {
        try {
          const width = Math.min(img.width, maxWidth), height = Math.round(img.height * width / img.width);
          if (!width || !height) throw new Error('The image has no usable dimensions.');
          const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
          const context = canvas.getContext('2d'); if (!context) throw new Error('Image processing is unavailable.');
          context.drawImage(img, 0, 0, width, height);
          canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('JPEG conversion failed.')), 'image/jpeg', quality);
        } catch (error) { reject(error); }
      }; img.src = reader.result;
    }; reader.readAsDataURL(file);
  });
}
export async function uploadGalleryPhotos(options) {
  const album = await currentAlbum(options, options.album), files = Array.from(options.files || []);
  if (!files.length || files.some(file => !file.type?.startsWith('image/'))) throw new Error('Choose image files to upload.');
  const existing = await readAll(() => options.client.from('gallery_images').select(PHOTO_COLUMNS.join(',')).eq('album_id', album.id).order('sort_order').order('created_at', { ascending: false }).order('id'));
  gate(options);
  const resize = options.resize || resizeGalleryPhoto, results = [], failures = []; let attempted = 0;
  const albumId = String(album.id).toLowerCase();
  if (!albumIdPattern.test(albumId)) throw new Error('The album storage folder could not be verified.');
  const base = Number(existing.at(-1)?.sort_order) || 0, folder = `albums/${albumId}`;
  for (let i = 0; i < files.length; i++) {
    attempted++;
    try {
      await access(options, album.id);
      const [full, thumb] = await Promise.all([resize(files[i], 1920, .82), resize(files[i], 600, .7)]);
      await access(options, album.id);
      const name = crypto.randomUUID(), fullPath = `${folder}/${name}_full.jpg`, thumbPath = `${folder}/${name}_thumb.jpg`;
      const storage = options.client.storage.from('gallery');
      const uploads = await Promise.all([storage.upload(fullPath, full, { cacheControl: '3600', upsert: false }), storage.upload(thumbPath, thumb, { cacheControl: '3600', upsert: false })]);
      if (uploads.some(result => result.error)) throw new Error('Image storage upload failed. Any uploaded file is retained for recovery.');
      await access(options, album.id);
      const image_url = storage.getPublicUrl(fullPath).data.publicUrl, thumbnail_url = storage.getPublicUrl(thumbPath).data.publicUrl;
      const { data, error } = await options.client.from('gallery_images').insert({ id: name, album_id: album.id, image_url, thumbnail_url, sort_order: base + results.length + 1 }).select('*').single();
      const row = complete(data, error, 'The uploaded image could not be registered.'); results.push(row);
    } catch (error) { failures.push({ index: i + 1, message: error.message }); }
    options.onProgress?.({ current: i + 1, total: files.length });
    if (options.isCurrent && !options.isCurrent()) break;
  }
  let updatedAlbum = album;
  if (results.length && !album.cover_image_url && (!options.isCurrent || options.isCurrent())) {
    try { updatedAlbum = await setGalleryCover({ ...options, album, photo: results[0] }); }
    catch (error) { failures.push({ index: null, message: `Photos were registered, but the cover was not updated: ${error.message}` }); }
  }
  // Every result is explicit: callers reload after a partial or uncertain outcome.
  return { photos: results, album: updatedAlbum, failures, attempted, retained_storage: true };
}
export const galleryMutationApi = { enabled: isGalleryWriteEnabled, saveAlbum: saveGalleryAlbum, uploadPhotos: uploadGalleryPhotos, removePhotos: removeGalleryPhotos, removeAlbum: removeGalleryAlbum, setCover: setGalleryCover, setVisibility: setGalleryVisibility };
