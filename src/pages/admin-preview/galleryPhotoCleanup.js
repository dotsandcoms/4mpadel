import { readAll } from './playersData.js';

const folderId = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const filename = /^(?:[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}|[a-z0-9]{1,6}_[0-9]{10,16})_(?:full|thumb)\.jpg$/;
const publicPath = '/storage/v1/object/public/gallery/';
const storagePath = /^\/storage\/v1\/(?:object(?:\/(?:public|sign|authenticated))?|render\/image\/(?:public|sign|authenticated))\/gallery\/(.+)$/;

function ownedKey(client, albumId, value) {
  if (!folderId.test(albumId)) return null;
  try {
    const url = new URL(value), project = new URL(client.supabaseUrl);
    const folder = `albums/${albumId}/`;
    if (url.origin !== project.origin || !['https:', 'http:'].includes(url.protocol)
      || !url.pathname.startsWith(publicPath + folder)
      || value !== url.origin + url.pathname) return null;
    const leaf = url.pathname.slice((publicPath + folder).length);
    return filename.test(leaf) ? folder + leaf : null;
  } catch {
    return null;
  }
}

function referenceKey(value) {
  try {
    return decodeURIComponent(new URL(value).pathname).match(storagePath)?.[1];
  } catch {
    return null;
  }
}

function profilePhotos(value) {
  try {
    const photos = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(photos) ? photos : [];
  } catch {
    return [];
  }
}

async function referencedKeys(client, candidates) {
  const [photos, albums, players] = await Promise.all([
    readAll(() => client.from('gallery_images').select('id,image_url,thumbnail_url').order('id')),
    readAll(() => client.from('albums').select('id,cover_image_url').order('id')),
    readAll(() => client.from('players').select('id,image_url,additional_images').order('id')),
  ]);
  const referenced = new Set();
  const mark = value => {
    if (!value) return;
    const key = referenceKey(value);
    if (candidates.has(key)) referenced.add(key);
  };
  for (const photo of photos) {
    mark(photo.image_url);
    mark(photo.thumbnail_url);
  }
  for (const album of albums) mark(album.cover_image_url);
  for (const player of players) {
    mark(player.image_url);
    for (const photo of profilePhotos(player.additional_images)) mark(photo);
  }
  return referenced;
}

async function removedOrAbsent(storage, key, deleted) {
  if (deleted.some(object => object?.name === key)) return true;
  if (typeof storage.exists !== 'function') return false;
  try {
    const { data, error } = await storage.exists(key);
    return data === false && (!error || Number(error.originalError?.status ?? error.status) === 404);
  } catch {
    return false;
  }
}

export async function cleanupConfirmedGalleryPhotos({ client, albumId, photos, verify, isCurrent }) {
  const urls = new Set(photos.flatMap(photo => [photo.image_url, photo.thumbnail_url]).filter(Boolean));
  const keys = new Set();
  let unsafe = 0;
  for (const url of urls) {
    const key = ownedKey(client, albumId, url);
    if (key) keys.add(key);
    else unsafe++;
  }
  async function cleanup(candidates, current, retained = 0) {
    const pending = [], removed = [];
    const values = [...candidates];
    for (let start = 0; start < values.length; start += 50) {
      const batch = values.slice(start, start + 50);
      let unreferenced = batch;
      try {
        // A scoped editor cannot see references in every player profile.
        if (!await verify(current)) {
          retained += values.length - start;
          break;
        }
        const referenced = await referencedKeys(client, new Set(batch));
        unreferenced = batch.filter(key => !referenced.has(key));
        retained += referenced.size;
        if (!unreferenced.length) continue;
        if (!await verify(current)) {
          retained += unreferenced.length + values.length - start - batch.length;
          break;
        }
        const storage = client.storage.from('gallery');
        const { data, error } = await storage.remove(unreferenced);
        if (error || !Array.isArray(data)) throw new Error('Storage did not confirm cleanup.');
        const outcomes = await Promise.all(unreferenced.map(key => removedOrAbsent(storage, key, data)));
        for (const [index, key] of unreferenced.entries()) (outcomes[index] ? removed : pending).push(key);
      } catch {
        pending.push(...unreferenced);
      }
    }
    return {
      cleaned: removed.length,
      retained,
      pending: pending.length,
      // Only files from a confirmed record deletion can create a retry.
      retry: pending.length ? nextCurrent => cleanup(pending, nextCurrent) : null,
    };
  }
  return cleanup(keys, isCurrent, unsafe);
}
