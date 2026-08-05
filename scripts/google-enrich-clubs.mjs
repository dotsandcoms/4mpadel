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
// If a batch comes back with a lot of low_confidence rows that look like real
// matches on inspection, don't just re-run this whole script (that re-spends
// Text Search + Details + Photos on the clubs you already matched correctly).
// Use scripts/rescore-report.mjs on the existing report instead — it only
// spends fresh API calls on rows that actually get promoted.
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
import {
    sleep, mapOpeningHours, extractAddressParts, textSearch, placeDetails,
    fetchClubPhotos, nameOverlapScore,
} from './lib/google-places-enrich.mjs';

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
            const results = await textSearch(searchQuery, MAPS_KEY);
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

            const details = await placeDetails(best.place_id, MAPS_KEY, { withPhotos: WITH_PHOTOS });
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
                const photoFields = await fetchClubPhotos(details, club, {
                    mapsKey: MAPS_KEY, supabase, bucket: PHOTOS_BUCKET, maxPhotos: MAX_PHOTOS,
                });
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
