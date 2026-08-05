// scripts/rescore-report.mjs
//
// Re-scores the low_confidence rows in a google-enrich-clubs.mjs report using
// the current (improved) nameOverlapScore, and only spends fresh Google API
// calls on whichever rows actually cross the confidence bar as a result.
// Existing "matched" rows are left untouched — this never re-spends Text
// Search/Details/Photos on clubs you've already matched correctly, and never
// demotes an already-matched row even if it would re-score lower.
//
// Usage:
//   node scripts/rescore-report.mjs <report.json> [--min-confidence 0.9] [--with-photos] [--max-photos 5]
//
// Writes a new report (does not overwrite the input) with promoted rows
// merged in, ready for scripts/import-google-report-to-db.mjs.

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
    console.error('Missing Supabase environment variables!');
    process.exit(1);
}
if (!MAPS_KEY) {
    console.error('Missing GOOGLE_MAPS_API_KEY / VITE_GOOGLE_MAPS_API_KEY!');
    process.exit(1);
}

const args = process.argv.slice(2);
const reportPath = args.find((a) => !a.startsWith('--'));
if (!reportPath) {
    console.error('Usage: node scripts/rescore-report.mjs <report.json> [--min-confidence 0.9] [--with-photos] [--max-photos 5]');
    process.exit(1);
}
const WITH_PHOTOS = args.includes('--with-photos');
const minConfArg = args.find((a) => a.startsWith('--min-confidence'));
const MIN_CONFIDENCE = minConfArg ? parseFloat(minConfArg.split('=')[1] || args[args.indexOf(minConfArg) + 1]) : 0;
const maxPhotosArg = args.find((a) => a.startsWith('--max-photos'));
const MAX_PHOTOS = maxPhotosArg ? parseInt(maxPhotosArg.split('=')[1] || args[args.indexOf(maxPhotosArg) + 1], 10) : 5;
const MATCH_FLOOR = Math.max(0.34, MIN_CONFIDENCE);

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const PHOTOS_BUCKET = 'profile-pics';

async function main() {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const lowConfRows = report.filter((r) => r.status === 'low_confidence');
    console.log(`Report rows: ${report.length} (${lowConfRows.length} currently low_confidence)`);

    // Recompute locally first — free, no API calls — to see who's actually promotable.
    const rescored = lowConfRows.map((r) => ({
        ...r,
        newConfidence: nameOverlapScore(r.club, r.google_name || ''),
    }));
    const toPromote = rescored.filter((r) => r.newConfidence >= MATCH_FLOOR);
    const staysUncertain = rescored.filter((r) => r.newConfidence < MATCH_FLOOR);

    console.log(`Rescoring against floor ${MATCH_FLOOR.toFixed(2)}: ${toPromote.length} promotable, ${staysUncertain.length} still uncertain\n`);

    if (toPromote.length === 0) {
        console.log('Nothing to promote — no API calls needed. (Try lowering --min-confidence if you expected more.)');
        return;
    }

    const { data: clubRows, error: clubErr } = await supabase
        .from('clubs')
        .select('id, name, city, province, country, address, lat, lng, website_url, contact_phone, opening_hours, cover_image_url, gallery')
        .in('name', toPromote.map((r) => r.club));
    if (clubErr) throw clubErr;
    const clubByName = new Map(clubRows.map((c) => [c.name, c]));

    const promotedRows = [];
    let promoted = 0;
    let stillFailed = 0;

    for (const row of toPromote) {
        const club = clubByName.get(row.club);
        if (!club) {
            console.error(`! no DB club found for "${row.club}" — skipping`);
            stillFailed += 1;
            continue;
        }
        try {
            const searchQuery = row.query || `${club.name} padel${club.city ? ` ${club.city}` : ''} South Africa`;
            const results = await textSearch(searchQuery, MAPS_KEY);
            const best = results[0];
            if (!best) {
                console.error(`! ${row.club} — Google returned no results on re-search`);
                stillFailed += 1;
                await sleep(150);
                continue;
            }
            const confidence = nameOverlapScore(club.name, best.name);

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

            promoted += 1;
            promotedRows.push({
                club: club.name, status: 'matched', google_name: best.name, confidence,
                fields_filled: Object.keys(fillIfEmpty),
                fillIfEmpty, alwaysUpdate,
                business_status: details.business_status,
            });
            console.log(`✓ ${club.name} — promoted, now matched "${best.name}" (${row.newConfidence.toFixed(2)}, was "${row.google_name}" @ ${(row.confidence ?? 0).toFixed(2)})`);
        } catch (err) {
            console.error(`! ${row.club} — ${err.message}`);
            stillFailed += 1;
        }
        await sleep(150);
    }

    // Merge: unchanged matched/no_match/error rows, remaining low_confidence rows
    // (with refreshed confidence for transparency), plus the newly-promoted ones.
    const promotedNames = new Set(promotedRows.map((r) => r.club));
    const untouched = report.filter((r) => r.status !== 'low_confidence');
    const remainingLowConf = staysUncertain
        .filter((r) => !promotedNames.has(r.club))
        .map((r) => ({ ...r, confidence: r.newConfidence, newConfidence: undefined }));
    const failedBackToLowConf = toPromote
        .filter((r) => !promotedNames.has(r.club))
        .map((r) => ({ ...r, confidence: r.newConfidence, newConfidence: undefined }));

    const merged = [...untouched, ...promotedRows, ...remainingLowConf, ...failedBackToLowConf];

    fs.mkdirSync(REPORTS_DIR, { recursive: true });
    const outPath = path.join(REPORTS_DIR, `google-enrich-report-rescored-${Date.now()}.json`);
    fs.writeFileSync(outPath, JSON.stringify(merged, null, 2));

    console.log(`\nDone. promoted=${promoted} still_uncertain=${staysUncertain.length} failed=${stillFailed}`);
    console.log(`Report written to: ${outPath}`);
    console.log(`\nNext step — load this into the admin review queue:`);
    console.log(`  node scripts/import-google-report-to-db.mjs "${outPath}"`);
    console.log(`Then open Admin → Clubs → Google Sync to review and approve.`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
