// scripts/import-google-report-to-db.mjs
//
// Imports a google-enrich-clubs.mjs JSON report into public.club_google_matches
// so the admin UI (GoogleSyncManager) has a persistent review queue.
// Cross-checks against the clubs table to tell "applied" apart from
// "matched but blocked by a duplicate place_id" (conflict).
//
// Usage: node scripts/import-google-report-to-db.mjs <report.json>

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing Supabase environment variables!');
    process.exit(1);
}

const reportPath = process.argv[2];
if (!reportPath) {
    console.error('Usage: node scripts/import-google-report-to-db.mjs <report.json>');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

    const { data: clubs, error } = await supabase.from('clubs').select('id, name, google_place_id');
    if (error) throw error;
    const byName = new Map(clubs.map((c) => [c.name, c]));
    const placeIdTakenBy = new Map(clubs.filter((c) => c.google_place_id).map((c) => [c.google_place_id, c.id]));

    const rows = [];
    for (const r of report) {
        const club = byName.get(r.club);
        if (!club) {
            console.warn(`! no DB club for report row "${r.club}"`);
            continue;
        }

        if (r.status === 'no_match') {
            rows.push({
                club_id: club.id, match_status: 'no_match', review_status: 'pending',
                google_name: null, google_address: null, confidence: null,
                fill_fields: {}, meta_fields: {},
            });
            continue;
        }
        if (r.status === 'low_confidence') {
            rows.push({
                club_id: club.id, match_status: 'low_confidence', review_status: 'pending',
                google_name: r.google_name || null, google_address: r.google_address || null,
                confidence: r.confidence ?? null, fill_fields: {}, meta_fields: {},
            });
            continue;
        }
        if (r.status === 'matched') {
            const placeId = r.alwaysUpdate?.google_place_id || null;
            const isApplied = placeId && club.google_place_id === placeId;
            const takenByOther = placeId && placeIdTakenBy.get(placeId) && placeIdTakenBy.get(placeId) !== club.id;
            const isConflict = !isApplied && takenByOther;
            rows.push({
                club_id: club.id,
                match_status: isConflict ? 'conflict' : 'matched',
                review_status: isApplied ? 'applied' : 'pending',
                google_place_id: placeId,
                google_name: r.google_name || null,
                google_address: r.fillIfEmpty?.address || null,
                confidence: r.confidence ?? null,
                fill_fields: r.fillIfEmpty || {},
                meta_fields: r.alwaysUpdate || {},
                business_status: r.business_status || null,
                conflict_note: isConflict
                    ? `Same Google listing already assigned to "${clubs.find((c) => c.id === placeIdTakenBy.get(placeId))?.name || 'another club'}"`
                    : null,
                reviewed_at: isApplied ? new Date().toISOString() : null,
            });
        }
    }

    console.log(`Upserting ${rows.length} rows into club_google_matches...`);
    const CHUNK = 100;
    for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const { error: upErr } = await supabase.from('club_google_matches').upsert(chunk, { onConflict: 'club_id' });
        if (upErr) throw upErr;
    }
    console.log('Done.');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
