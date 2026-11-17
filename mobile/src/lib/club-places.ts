import { supabase } from './supabase';
import { publicPhoto, publicUrl } from './clubs';

export type PlaceAttribution = { name: string; url: string | null };
export type ClubPhoto = { url: string; caption: string; source: 'Club' | 'Google Maps'; attributions: PlaceAttribution[] };
export type ClubReview = { author: string; authorUrl: string | null; avatar: string | null; rating: number | null; relativeTime: string; text: string; time: number | null };
export type ClubPlace = { rating: number | null; reviewCount: number | null; mapsUrl: string | null; website: string | null; phone: string | null; openNow: boolean | null; hours: string[]; businessStatus: string; photos: ClubPhoto[]; reviews: ClubReview[]; attributions: PlaceAttribution[] };
const str = (value: unknown) => typeof value === 'string' ? value : '';
const attribution = (rows: unknown): PlaceAttribution[] => Array.isArray(rows) ? rows.filter(row => row && str(row.name)).map(row => ({ name: str(row.name), url: publicUrl(row.url) })) : [];
export function parseClubPlace(row: any): ClubPlace | null {
  if (!row || typeof row !== 'object') return null;
  return {
    rating: typeof row.rating === 'number' && row.rating > 0 && row.rating <= 5 ? row.rating : null,
    reviewCount: Number.isSafeInteger(row.reviewCount) && row.reviewCount >= 0 ? row.reviewCount : null,
    mapsUrl: publicUrl(row.mapsUrl), website: publicUrl(row.website),
    phone: /^\+?[0-9 ().-]{6,30}$/.test(str(row.phone)) ? str(row.phone) : null,
    openNow: typeof row.openNow === 'boolean' ? row.openNow : null,
    hours: Array.isArray(row.hours) ? row.hours.filter((value: unknown) => typeof value === 'string') : [], businessStatus: str(row.businessStatus),
    photos: (Array.isArray(row.photos) ? row.photos.slice(0, 6) : []).flatMap((photo: any) => { const url = publicPhoto(photo?.url); return url ? [{ url, caption: '', source: 'Google Maps' as const, attributions: attribution(photo.attributions) }] : []; }),
    reviews: (Array.isArray(row.reviews) ? row.reviews.slice(0, 5) : []).filter((review: any) => review && str(review.author)).map((review: any) => ({ author: str(review.author), authorUrl: publicUrl(review.authorUrl), avatar: publicPhoto(review.avatar), rating: typeof review.rating === 'number' && review.rating >= 1 && review.rating <= 5 ? review.rating : null, relativeTime: str(review.relativeTime), text: str(review.text), time: typeof review.time === 'number' ? review.time : null })),
    attributions: attribution(row.attributions),
  };
}
/** Live per-visit data. No persistent cache and no device location in the request. */
export async function fetchClubPlace(slug: string, signal: AbortSignal): Promise<ClubPlace | null> {
  const { data, error } = await supabase.functions.invoke('native-club-places', { body: { slug }, signal });
  if (signal.aborted) throw new Error('Cancelled');
  if (error || data?.error) throw new Error('Google photos and reviews couldn’t load. Please retry.');
  return data?.unavailable ? null : parseClubPlace(data?.place);
}
