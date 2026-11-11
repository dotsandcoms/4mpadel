import { galleryOf } from './profile';
import { MAX_PLAYER_GALLERY_PHOTOS } from './profile-photos';
import { supabase } from './supabase';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function owner() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email) throw new Error('Sign in to add photos to your Player Gallery.');
  return { id: data.user.id, email: data.user.email };
}
async function player(email: string) {
  const { data, error } = await supabase.from('players').select('id,additional_images').eq('email', email).maybeSingle();
  if (error || !data) throw new Error('Your Player Gallery could not load. Please try again.');
  return data as { id: number; additional_images: string | string[] | null };
}
export async function fetchMyPlayerGallery() {
  const user = await owner();
  return galleryOf(await player(user.email));
}

/** Append a published album photo to the current account only; never accept a supplied player ID or image URL. */
export async function saveAlbumPhotoToProfile(albumId: string, photoId: string) {
  if (!uuid.test(albumId) || !uuid.test(photoId)) throw new Error('This album photo is unavailable.');
  const user = await owner();
  const [album, photo] = await Promise.all([
    supabase.from('albums').select('id').eq('id', albumId).eq('is_active', true).maybeSingle(),
    supabase.from('gallery_images').select('id,image_url').eq('id', photoId).eq('album_id', albumId).maybeSingle(),
  ]);
  if (album.error || photo.error || !album.data || !photo.data) throw new Error('This album photo is unavailable.');
  const url = photo.data.image_url as string;
  try { if (new URL(url).protocol !== 'https:') throw new Error(); }
  catch { throw new Error('This album photo is unavailable.'); }
  // Compare the actual JSONB value so a concurrent gallery edit is never overwritten.
  // The website has saved both JSON arrays and JSON-encoded strings historically.
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await player(user.email);
    const gallery = galleryOf(current);
    if (gallery.includes(url)) return { gallery, added: false };
    if (gallery.length >= MAX_PLAYER_GALLERY_PHOTOS) throw new Error('Your Player Gallery is full. Remove a photo in Profile → Photos before adding another.');
    const session = await owner();
    if (session.id !== user.id || session.email !== user.email) throw new Error('Your account changed. Reopen this photo and try again.');
    const next = [...gallery, url];
    let query = supabase.from('players').update({ additional_images: JSON.stringify(next) }).eq('id', current.id).eq('email', user.email);
    query = current.additional_images == null ? query.or('additional_images.is.null,additional_images.eq.null') : query.eq('additional_images', JSON.stringify(current.additional_images));
    const { data, error } = await query.select('id').maybeSingle();
    if (error) throw new Error('This photo could not be added to your Player Gallery. Please try again.');
    if (data) return { gallery: next, added: true };
  }
  throw new Error('Your Player Gallery changed while saving. Please try again.');
}
