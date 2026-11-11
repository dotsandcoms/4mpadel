import { createClient } from 'npm:@supabase/supabase-js@2.112.3';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const statuses = ['published', '4m_approved', '4m_premium'];
const pending = new Map<string, Promise<unknown>>();
const attempts = new Map<string, { start: number; count: number }>();
const text = (value: unknown) => typeof value === 'string' ? value : '';
function safeUrl(value: unknown, media = false) {
  try {
    const url = new URL(text(value));
    if (url.protocol !== 'https:' || url.username || url.password || url.searchParams.has('key')) return null;
    if (media && !['googleusercontent.com', 'ggpht.com', 'google.com'].some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) return null;
    return url.href;
  } catch { return null; }
}
const plain = (value: unknown) => text(value).replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&#39;|&#x27;/gi, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
function attribution(html: unknown) {
  const value = text(html), href = /href=["']([^"']+)["']/i.exec(value)?.[1];
  return { name: plain(value), url: safeUrl(href) };
}
function admit(userId: string) {
  const now = Date.now();
  for (const [key, value] of attempts) if (now - value.start >= 60000) attempts.delete(key);
  const current = attempts.get(userId) || { start: now, count: 0 };
  if (current.count >= 8 || attempts.size >= 5000 && !attempts.has(userId)) return false;
  attempts.set(userId, { start: current.start, count: current.count + 1 }); return true;
}
async function googleClub(placeId: string, key: string) {
  const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
  url.searchParams.set('place_id', placeId); url.searchParams.set('key', key);
  url.searchParams.set('fields', 'place_id,name,rating,user_ratings_total,reviews,photos,url,website,international_phone_number,opening_hours,business_status');
  url.searchParams.set('language', 'en');
  const response = await fetch(url, { signal: AbortSignal.timeout(10000), redirect: 'error' });
  const payload = await response.json();
  if (!response.ok || payload.status !== 'OK') throw new Error('Google venue information is temporarily unavailable.');
  const place = payload.result;
  if (!place || place.place_id !== placeId) throw new Error('Google venue information is temporarily unavailable.');
  // Resolve media redirects on the server, so the Google API key never reaches a device.
  // No photo references, review content or resolved media are saved to our database/cache.
  const photos = await Promise.all((Array.isArray(place.photos) ? place.photos.slice(0, 6) : []).map(async (photo: Record<string, unknown>) => {
    const reference = text(photo.photo_reference); if (!reference) return null;
    const media = new URL('https://maps.googleapis.com/maps/api/place/photo');
    media.searchParams.set('key', key); media.searchParams.set('maxwidth', '1000'); media.searchParams.set('photo_reference', reference);
    try {
      const result = await fetch(media, { redirect: 'manual', signal: AbortSignal.timeout(7000) });
      const image = result.status >= 300 && result.status < 400 ? safeUrl(result.headers.get('location'), true) : null;
      await result.body?.cancel();
      return image ? { url: image, attributions: (Array.isArray(photo.html_attributions) ? photo.html_attributions : []).map(attribution).filter(item => item.name) } : null;
    } catch { return null; }
  }));
  return {
    source: 'Google Maps', fetchedAt: new Date().toISOString(), name: text(place.name),
    rating: typeof place.rating === 'number' ? place.rating : null,
    reviewCount: Number.isSafeInteger(place.user_ratings_total) ? place.user_ratings_total : null,
    mapsUrl: safeUrl(place.url), website: safeUrl(place.website), phone: text(place.international_phone_number),
    openNow: typeof place.opening_hours?.open_now === 'boolean' ? place.opening_hours.open_now : null,
    hours: Array.isArray(place.opening_hours?.weekday_text) ? place.opening_hours.weekday_text.filter((value: unknown) => typeof value === 'string') : [],
    businessStatus: text(place.business_status), photos: photos.filter(Boolean),
    attributions: (Array.isArray(payload.html_attributions) ? payload.html_attributions : []).map(attribution).filter(item => item.name),
    reviews: (Array.isArray(place.reviews) ? place.reviews.slice(0, 5) : []).map((review: Record<string, unknown>) => ({
      author: text(review.author_name), authorUrl: safeUrl(review.author_url), avatar: safeUrl(review.profile_photo_url, true),
      rating: typeof review.rating === 'number' ? review.rating : null, relativeTime: text(review.relative_time_description),
      text: text(review.text), time: typeof review.time === 'number' ? review.time : null,
    })),
  };
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const authorization = req.headers.get('authorization') || '';
    if (!/^Bearer\s+\S+$/i.test(authorization)) return json({ error: 'Sign in to see Google club photos and reviews.' }, 401);
    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) return json({ error: 'Sign in to see Google club photos and reviews.' }, 401);
    const raw = await req.text();
    if (raw.length > 512) return json({ error: 'Invalid club request.' }, 400);
    let input; try { input = JSON.parse(raw); } catch { return json({ error: 'Invalid club request.' }, 400); }
    if (typeof input?.slug !== 'string' || !/^[a-z0-9][a-z0-9-]{0,199}$/.test(input.slug)) return json({ error: 'Invalid club request.' }, 400);
    if (!admit(user.id)) return json({ error: 'Please wait a moment before refreshing club information.' }, 429);
    // Resolve the linked Place ID ourselves, through the caller's existing RLS access.
    // A request cannot choose an arbitrary place, URL, field mask or private club.
    const { data: club, error } = await client.from('clubs').select('id,status,google_place_id').eq('slug', input.slug).in('status', statuses).maybeSingle();
    if (error) return json({ error: 'Club information couldn’t load.' }, 503);
    if (!club || !statuses.includes(club.status)) return json({ error: 'Club not found.' }, 404);
    if (!club.google_place_id) return json({ unavailable: true });
    const key = Deno.env.get('GOOGLE_MAPS_API_KEY');
    if (!key) return json({ error: 'Google club photos and reviews are temporarily unavailable.' }, 503);
    const request = pending.get(club.id) || googleClub(club.google_place_id, key);
    pending.set(club.id, request);
    try { return json({ place: await request }); } finally { if (pending.get(club.id) === request) pending.delete(club.id); }
  } catch { return json({ error: 'Google club photos and reviews couldn’t load. Please try again.' }, 503); }
});
