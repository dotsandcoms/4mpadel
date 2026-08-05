// scripts/google-enrich-clubs.mjs
//
// Enriches public.clubs from the Google Places API (Text Search + Place Details).
// Fills only currently-empty fields (address, lat/lng, phone, website, opening_hours)
// so manually-entered club data is never overwritten. Always refreshes the
// google_place_id / google_maps_url / rating metadata since those are just a mirror
// of Google's own record.
//
// Usage:
//   node scripts/google-enrich-clubs.mjs --dry-run [--limit 10]   (default: dry-run, writes a report, no DB writes)
//   node scripts/google-enrich-clubs.mjs --apply [--limit 10]     (writes matched fields to the DB)
//   node scripts/google-enrich-clubs.mjs --apply --force          (re-syncs clubs that already have a google_place_id)
//   node scripts/google-enrich-clubs.mjs --apply --with-photos    (also pulls Google Photos into cover_image_url/gallery)
//   node scripts/google-enrich-clubs.mjs --apply --with-photos --max-photos 3
//   node scripts/google-enrich-clubs.mjs --with-photos --min-confidence 0.9   (only near-exact name matches; everything softer falls to low_confidence for manual review)
//
// --min-confidence raises the bar for what counts as "matched" (default effective
// floor is 0.34). Anything below it is classified low_confidence instead — still
// visible in the review queue's "Uncertain" tab, just not auto-treated as a real
// match — so a stricter run can be scoped to near-exact matches without spending
// Details/Photo API calls on borderline guesses that need a human to confirm anyway.
//
// --with-photos downloads up to --max-photos (default 5) Google Places photos per
// club and re-hosts them in the "profile-pics" Supabase Storage bucket, because a
// Google photo_reference is not cacheable/permanent (it can expire and always needs
// our API key to resolve) — see https://developers.google.com/maps/documentation/places/web-service/legacy/photos.
// This upload happens regardless of --apply (storage isn't the clubs table), so the
// resulting URLs are ready to review in the admin Google Sync screen either way.
// Only fills cover_image_url / gallery when they're currently empty, same
// never-overwrite rule as every other field here. Costs an extra Place Photo request
// per image (billed separately from Place Details), so it's opt-in.

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.join(SCRIPT_DIR, 'reports');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const MAPS_KEY = process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing Supabase environment variables! Cannot run.');
    process.exit(1);
}
if (!MAPS_KEY) {
    console.error('Missing GOOGLE_MAPS_API_KEY / VITE_GOOGLE_MAPS_API_KEY! Cannot run.');
    process.exit(1);
}

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const FORCE = args.includes('--force');
const WITH_PHOTOS = args.includes('--with-photos');
const limitArg = args.find((a) => a.startsWith('--limit'));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1] || args[args.indexOf(limitArg) + 1], 10) : null;
const minConfArg = args.find((a) => a.startsWith('--min-confidence'));
const MIN_CONFIDENCE = minConfArg ? parseFloat(minConfArg.split('=')[1] || args[args.indexOf(minConfArg) + 1]) : 0;
const maxPhotosArg = args.find((a) => a.startsWith('--max-photos'));
const MAX_PHOTOS = maxPhotosArg ? parseInt(maxPhotosArg.split('=')[1] || args[args.indexOf(maxPhotosArg) + 1], 10) : 5;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const PHOTOS_BUCKET = 'profile-pics';

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function hhmm(t) {
    // Google returns "HHmm" e.g. "0630"
    if (!t || t.length !== 4) return null;
    return `${t.slice(0, 2)}:${t.slice(2)}`;
}

function mapOpeningHours(periods) {
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

function extractAddressParts(components = []) {
    const find = (type) => components.find((c) => c.types.includes(type))?.long_name || null;
    return {
        city: find('locality') || find('sublocality') || find('postal_town'),
        province: find('administrative_area_level_1'),
        country: find('country'),
    };
}

async function textSearch(query) {
    const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
    url.searchParams.set('query', query);
    url.searchParams.set('key', MAPS_KEY);
    const res = await fetch(url);
    const data = await res.json();
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
        throw new Error(`Text Search error: ${data.status} ${data.error_message || ''}`);
    }
    return data.results || [];
}

async function placeDetails(placeId) {
    const fields = [
        'name', 'formatted_address', 'address_component', 'geometry',
        'international_phone_number', 'website', 'opening_hours',
        'rating', 'user_ratings_total', 'url', 'business_status',
        ...(WITH_PHOTOS ? ['photos'] : []),
    ].join(',');
    const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
    url.searchParams.set('place_id', placeId);
    url.searchParams.set('fields', fields);
    url.searchParams.set('key', MAPS_KEY);
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
async function downloadAndUploadPhoto(photoReference, clubId, index) {
    const photoUrl = new URL('https://maps.googleapis.com/maps/api/place/photo');
    photoUrl.searchParams.set('photo_reference', photoReference);
    photoUrl.searchParams.set('maxwidth', '1600');
    photoUrl.searchParams.set('key', MAPS_KEY);

    const res = await fetch(photoUrl);
    if (!res.ok) {
        throw new Error(`Place Photo download failed: HTTP ${res.status}`);
    }
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const ext = contentType.includes('png') ? 'png' : 'jpg';
    const buffer = Buffer.from(await res.arrayBuffer());

    const storagePath = `clubs/${clubId}/google-${index}.${ext}`;
    const { error: uploadErr } = await supabase.storage
        .from(PHOTOS_BUCKET)
        .upload(storagePath, buffer, { contentType, upsert: true });
    if (uploadErr) throw uploadErr;

    const { data: { publicUrl } } = supabase.storage.from(PHOTOS_BUCKET).getPublicUrl(storagePath);
    return publicUrl;
}

// Fetches up to MAX_PHOTOS Google photos for a place and uploads them, only for
// whichever of cover_image_url/gallery the club doesn't already have set.
async function fetchClubPhotos(details, club) {
    const photos = Array.isArray(details.photos) ? details.photos.slice(0, MAX_PHOTOS) : [];
    if (photos.length === 0) return {};

    const needsCover = !club.cover_image_url;
    const needsGallery = !Array.isArray(club.gallery) || club.gallery.length === 0;
    if (!needsCover && !needsGallery) return {};

    const urls = [];
    for (let i = 0; i < photos.length; i += 1) {
        try {
            const url = await downloadAndUploadPhoto(photos[i].photo_reference, club.id, i);
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

function nameOverlapScore(clubName, googleName) {
    const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
    const a = new Set(norm(clubName));
    const b = new Set(norm(googleName));
    let hits = 0;
    for (const w of a) if (b.has(w)) hits += 1;
    return a.size ? hits / a.size : 0;
}

async function main() {
    let query = supabase
        .from('clubs')
        .select('id, name, slug, city, province, country, address, lat, lng, website_url, contact_phone, opening_hours, google_place_id, cover_image_url, gallery')
        .order('name');
    if (!FORCE) query = query.is('google_place_id', null);
    if (LIMIT) query = query.limit(LIMIT);

    const { data: clubs, error } = await query;
    if (error) throw error;

    console.log(`Mode: ${APPLY ? 'APPLY (writing to DB)' : 'DRY RUN (report only)'}`);
    console.log(`Clubs to process: ${clubs.length}${FORCE ? ' (force re-sync)' : ''}\n`);

    const report = [];
    let matched = 0;
    let unmatched = 0;
    let lowConfidence = 0;

    for (const club of clubs) {
        const searchQuery = `${club.name} padel${club.city ? ` ${club.city}` : ''} South Africa`;
        try {
            const results = await textSearch(searchQuery);
            if (results.length === 0) {
                unmatched += 1;
                report.push({ club: club.name, status: 'no_match', query: searchQuery });
                console.log(`✗ ${club.name} — no match`);
                await sleep(150);
                continue;
            }

            const best = results[0];
            const confidence = nameOverlapScore(club.name, best.name);
            // --min-confidence doubles as the "treat as a real match" bar, not just the
            // --apply gate: anything below it is demoted to low_confidence (Uncertain tab)
            // instead of matched, so a stricter run can be scoped to near-exact matches
            // without spending Details/Photo calls on borderline guesses.
            const matchFloor = Math.max(0.34, MIN_CONFIDENCE);
            if (confidence < matchFloor) {
                lowConfidence += 1;
                report.push({
                    club: club.name, status: 'low_confidence', query: searchQuery,
                    google_name: best.name, google_address: best.formatted_address, confidence,
                });
                console.log(`? ${club.name} — low confidence match: "${best.name}" (${confidence.toFixed(2)})`);
                await sleep(150);
                continue;
            }

            const details = await placeDetails(best.place_id);
            const addressParts = extractAddressParts(details.address_components);
            const openingHours = mapOpeningHours(details.opening_hours?.periods);

            const fillIfEmpty = {};
            if (!club.address && details.formatted_address) fillIfEmpty.address = details.formatted_address;
            if (!club.city && addressParts.city) fillIfEmpty.city = addressParts.city;
            if (!club.province && addressParts.province) fillIfEmpty.province = addressParts.province;
            if (!club.country && addressParts.country) fillIfEmpty.country = addressParts.country;
            if (!club.lat && details.geometry?.location?.lat) fillIfEmpty.lat = details.geometry.location.lat;
            if (!club.lng && details.geometry?.location?.lng) fillIfEmpty.lng = details.geometry.location.lng;
            if (!club.website_url && details.website) fillIfEmpty.website_url = details.website;
            if (!club.contact_phone && details.international_phone_number) fillIfEmpty.contact_phone = details.international_phone_number;
            if ((!club.opening_hours || Object.keys(club.opening_hours).length === 0) && openingHours) {
                fillIfEmpty.opening_hours = openingHours;
            }
            if (WITH_PHOTOS) {
                const photoFields = await fetchClubPhotos(details, club);
                Object.assign(fillIfEmpty, photoFields);
            }

            const alwaysUpdate = {
                google_place_id: best.place_id,
                google_maps_url: details.url || null,
                google_rating: details.rating ?? null,
                google_ratings_total: details.user_ratings_total ?? null,
                google_synced_at: new Date().toISOString(),
            };

            matched += 1;
            const row = {
                club: club.name, status: 'matched', google_name: best.name, confidence,
                fields_filled: Object.keys(fillIfEmpty),
                fillIfEmpty, alwaysUpdate,
                business_status: details.business_status,
            };
            report.push(row);
            console.log(`✓ ${club.name} — matched "${best.name}" (filling: ${Object.keys(fillIfEmpty).join(', ') || 'none new'})`);

            if (APPLY && confidence >= MIN_CONFIDENCE) {
                const { error: updErr } = await supabase
                    .from('clubs')
                    .update({ ...fillIfEmpty, ...alwaysUpdate })
                    .eq('id', club.id);
                if (updErr) console.error(`  ! update failed for ${club.name}: ${updErr.message}`);
            } else if (APPLY) {
                console.log(`  (skipped write — confidence ${confidence.toFixed(2)} below --min-confidence ${MIN_CONFIDENCE})`);
            }
        } catch (err) {
            report.push({ club: club.name, status: 'error', message: err.message });
            console.error(`! ${club.name} — ${err.message}`);
        }
        await sleep(150); // stay well under QPS limits
    }

    fs.mkdirSync(REPORTS_DIR, { recursive: true });
    const outPath = path.join(REPORTS_DIR, `google-enrich-report-${Date.now()}.json`);
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

    console.log(`\nDone. matched=${matched} low_confidence=${lowConfidence} unmatched=${unmatched}`);
    console.log(`Report written to: ${outPath}`);
    console.log(`\nNext step — load this into the admin review queue:`);
    console.log(`  node scripts/import-google-report-to-db.mjs "${outPath}"`);
    console.log(`Then open Admin → Clubs → Google Sync to review and approve.`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
