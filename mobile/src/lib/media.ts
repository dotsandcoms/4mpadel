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

export async function fetchMediaAlbums(parentId?: string): Promise<MediaAlbum[]> {
  let query = supabase.from('albums').select(albumFields).eq('is_active', true);
  query = parentId ? query.eq('parent_album_id', parentId) : query.is('parent_album_id', null);
  const { data, error } = await query.order('is_featured', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchMediaAlbum(id: string) {
  const { data, error } = await supabase.from('albums').select(albumFields).eq('id', id).eq('is_active', true).single();
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
