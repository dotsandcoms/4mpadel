// scripts/lib/google-places-enrich.mjs
//
// Shared Google Places (Legacy) helpers used by scripts/google-enrich-clubs.mjs
// and scripts/rescore-report.mjs, so both stay consistent — in particular the
// name-matching score, which drives what counts as a "real" match.

export const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function hhmm(t) {
    // Google returns "HHmm" e.g. "0630"
    if (!t || t.length !== 4) return null;
    return `${t.slice(0, 2)}:${t.slice(2)}`;
}

export function mapOpeningHours(periods) {
    if (!Array.isArray(periods) || periods.length === 0) return null;
    const result = {};
    for (const key of DAY_KEYS) {
        result[key] = { open: '00:00', close: '00:00', closed: true };
    }
    for (const period of periods) {
        const openDay = period.open?.day;
        if (openDay === undefined || openDay === null) continue;
        const dayKey = DAY_KEYS[openDay];
        const open = hhmm(period.open?.time);
        const close = period.close ? hhmm(period.close.time) : '23:59'; // no close = open 24h
        if (!open) continue;
        result[dayKey] = { open, close: close || '23:59', closed: false };
    }
    return result;
}

export function extractAddressParts(components = []) {
    const find = (type) => components.find((c) => c.types.includes(type))?.long_name || null;
    return {
        city: find('locality') || find('sublocality') || find('postal_town'),
        province: find('administrative_area_level_1'),
        country: find('country'),
    };
}

export async function textSearch(query, mapsKey) {
    const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
    url.searchParams.set('query', query);
    url.searchParams.set('key', mapsKey);
    const res = await fetch(url);
    const data = await res.json();
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        throw new Error(`Text Search error: ${data.status} ${data.error_message || ''}`);
    }
    return data.results || [];
}

export async function placeDetails(placeId, mapsKey, { withPhotos = false } = {}) {
    const fields = [
        'name', 'formatted_address', 'address_component', 'geometry',
        'international_phone_number', 'website', 'opening_hours',
        'rating', 'user_ratings_total', 'url', 'business_status',
        ...(withPhotos ? ['photos'] : []),
    ].join(',');
    const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
    url.searchParams.set('place_id', placeId);
    url.searchParams.set('fields', fields);
    url.searchParams.set('key', mapsKey);
    const res = await fetch(url);
    const data = await res.json();
    if (data.status !== 'OK') {
        throw new Error(`Place Details error: ${data.status} ${data.error_message || ''}`);
    }
    return data.result;
}

// Downloads one Google Places photo and re-hosts it in Supabase Storage.
// A raw Google photo_reference can't be stored directly: it isn't guaranteed
// stable and always needs our API key to resolve, so anything we keep in
// clubs.cover_image_url/gallery has to be a URL that works on its own.
async function downloadAndUploadPhoto(photoReference, clubId, index, { mapsKey, supabase, bucket }) {
    const photoUrl = new URL('https://maps.googleapis.com/maps/api/place/photo');
    photoUrl.searchParams.set('photo_reference', photoReference);
    photoUrl.searchParams.set('maxwidth', '1600');
    photoUrl.searchParams.set('key', mapsKey);

    const res = await fetch(photoUrl);
    if (!res.ok) {
        throw new Error(`Place Photo download failed: HTTP ${res.status}`);
    }
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const ext = contentType.includes('png') ? 'png' : 'jpg';
    const buffer = Buffer.from(await res.arrayBuffer());

    const storagePath = `clubs/${clubId}/google-${index}.${ext}`;
    const { error: uploadErr } = await supabase.storage
        .from(bucket)
        .upload(storagePath, buffer, { contentType, upsert: true });
    if (uploadErr) throw uploadErr;

    const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(storagePath);
    return publicUrl;
}

// Fetches up to maxPhotos Google photos for a place and uploads them, only for
// whichever of cover_image_url/gallery the club doesn't already have set.
export async function fetchClubPhotos(details, club, { mapsKey, supabase, bucket, maxPhotos = 5 }) {
    const photos = Array.isArray(details.photos) ? details.photos.slice(0, maxPhotos) : [];
    if (photos.length === 0) return {};

    const needsCover = !club.cover_image_url;
    const needsGallery = !Array.isArray(club.gallery) || club.gallery.length === 0;
    if (!needsCover && !needsGallery) return {};

    const urls = [];
    for (let i = 0; i < photos.length; i += 1) {
        try {
            const url = await downloadAndUploadPhoto(photos[i].photo_reference, club.id, i, { mapsKey, supabase, bucket });
            urls.push(url);
        } catch (err) {
            console.error(`    ! photo ${i} failed for ${club.name}: ${err.message}`);
        }
        await sleep(150);
    }
    if (urls.length === 0) return {};

    const result = {};
    if (needsCover) result.cover_image_url = urls[0];
    if (needsGallery) {
        const galleryUrls = needsCover ? urls.slice(1) : urls;
        if (galleryUrls.length > 0) {
            result.gallery = galleryUrls.map((url) => ({ url, category: 'other', caption: '' }));
        }
    }
    return result;
}

const normalizeWords = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const collapseSpaces = (s) => normalizeWords(s).replace(/\s+/g, '');

/**
 * Scores how well two business names match, 0–1. Combines two signals:
 *
 * 1. Word overlap — what fraction of the club's own name-words appear in
 *    Google's name (handles generic suffixes like "Padel Club" vs "Padel").
 * 2. Space-collapsed containment — handles concatenation/spacing artifacts
 *    that word-tokenizing misses entirely, e.g. "WIPADEL @ Sherwood Bowling
 *    Club" vs Google's "Wi Padel Sherwood": tokenized, "wipadel" shares no
 *    words with "wi"/"padel" and scores ~0.25 even though it's the same
 *    place. Collapsing spaces/punctuation and checking full containment
 *    catches this: "wipadelsherwood" is a substring of
 *    "wipadelsherwoodbowlingclub", a strong signal regardless of word
 *    boundaries.
 *
 * Takes the max of the two so either signal alone can carry a real match.
 * Doesn't handle reordered names (e.g. "Padelgo Yzerfontein" vs "Yzerfontein
 * Padel") — those still need a human via "Find match".
 */
export function nameOverlapScore(clubName, googleName) {
    const norm = (s) => normalizeWords(s).split(/\s+/).filter(Boolean);
    const a = new Set(norm(clubName));
    const b = new Set(norm(googleName));
    let hits = 0;
    for (const w of a) if (b.has(w)) hits += 1;
    const wordScore = a.size ? hits / a.size : 0;

    const collapsedClub = collapseSpaces(clubName);
    const collapsedGoogle = collapseSpaces(googleName);
    let collapsedScore = 0;
    if (collapsedClub && collapsedGoogle) {
        if (collapsedClub === collapsedGoogle) {
            collapsedScore = 1;
        } else if (collapsedGoogle.includes(collapsedClub) || collapsedClub.includes(collapsedGoogle)) {
            const shorter = Math.min(collapsedClub.length, collapsedGoogle.length);
            const longer = Math.max(collapsedClub.length, collapsedGoogle.length);
            // Full containment of the shorter name is already a strong signal on its
            // own — floor at 0.85 rather than scaling straight from 0, so a big venue
            // qualifier ("... Bowling Club") tacked onto one side doesn't drag a real
            // match back down into low-confidence territory.
            collapsedScore = 0.85 + 0.1 * (shorter / longer);
        }
    }

    return Math.max(wordScore, collapsedScore);
}
