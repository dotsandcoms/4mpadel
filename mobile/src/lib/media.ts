import { supabase } from '@/lib/supabase';

export type MediaAlbum = {
  id: string; title: string; description: string | null; cover_image_url: string | null;
  album_date: string | null; created_at: string; is_featured: boolean;
  photographer_name: string | null; photographer_instagram: string | null;
  youtube_playlist_url: string | null; event_id: number | null;
};
export type MediaPhoto = { id: string; image_url: string; thumbnail_url: string | null; caption: string | null };
const albumFields = 'id,title,description,cover_image_url,album_date,created_at,is_featured,photographer_name,photographer_instagram,youtube_playlist_url,event_id';
export const PHOTO_PAGE_SIZE = 60;

/** Album credits may contain a handle or a profile URL. Only open Instagram profiles. */
export function photographerInstagramUrl(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  let handle = value.trim().replace(/^@/, '');
  if (/^(?:https?:\/\/|(?:www\.)?instagram\.com\/)/i.test(handle)) {
    try {
      const url = new URL(/^https?:\/\//i.test(handle) ? handle : `https://${handle}`);
      if (url.protocol !== 'https:' || !['instagram.com', 'www.instagram.com', 'm.instagram.com'].includes(url.hostname) || url.username || url.password || url.port) return null;
      handle = url.pathname.replace(/^\//, '').replace(/\/$/, '');
    } catch { return null; }
  }
  if (!/^[a-zA-Z0-9._]{1,30}$/.test(handle) || ['p', 'reel', 'reels', 'explore', 'stories', 'accounts', 'direct'].includes(handle.toLowerCase())) return null;
  return `https://www.instagram.com/${handle}/`;
}

export async function fetchMediaAlbums(parentId?: string, limit?: number): Promise<MediaAlbum[]> {
  let query = supabase.from('albums').select(albumFields).eq('is_active', true);
  query = parentId ? query.eq('parent_album_id', parentId) : query.is('parent_album_id', null);
  query = query.order('is_featured', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });
  if (limit) query = query.limit(limit);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function fetchMediaAlbum(id: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,150}$/.test(id)) throw new Error('This album is unavailable.');
  const key = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? 'id' : 'slug';
  const { data, error } = await supabase.from('albums').select(albumFields).eq(key, id).eq('is_active', true).single();
  if (error) throw error;
  const album = data as MediaAlbum;
  if (!album.youtube_playlist_url && album.event_id) {
    const result = await supabase.from('calendar').select('youtube_playlist_url').eq('id', album.event_id).maybeSingle();
    if (result.error) throw result.error;
    album.youtube_playlist_url = result.data?.youtube_playlist_url ?? null;
  }
  return album;
}

export async function fetchMediaPhotos(albumId: string, offset = 0): Promise<MediaPhoto[]> {
  const { data, error } = await supabase.from('gallery_images').select('id,image_url,thumbnail_url,caption')
    .eq('album_id', albumId).order('sort_order', { ascending: true }).order('created_at', { ascending: true }).order('id')
    .range(offset, offset + PHOTO_PAGE_SIZE - 1);
  if (error) throw error;
  return data ?? [];
}

/** Slug links resolve once; every child/photo query then uses the canonical album UUID. */
export async function fetchMediaContent(idOrSlug?: string) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const resolved = idOrSlug && !uuid.test(idOrSlug) ? await fetchMediaAlbum(idOrSlug) : null;
  const id = resolved?.id || idOrSlug;
  const [albums, album, photos] = await Promise.all([
    fetchMediaAlbums(id), resolved || (id ? fetchMediaAlbum(id) : null), id ? fetchMediaPhotos(id) : [],
  ]);
  return { albums, album, photos };
}
