// scripts/apply-google-enrich-report.mjs
//
// Applies a previously-generated google-enrich-clubs.mjs report to the DB,
// without re-calling the Google Places API. Only writes "matched" rows at
// or above --min-confidence (default 0.51).
//
// Usage: node scripts/apply-google-enrich-report.mjs <report.json> [--min-confidence=0.51]

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

const args = process.argv.slice(2);
const reportPath = args.find((a) => !a.startsWith('--'));
if (!reportPath) {
    console.error('Usage: node scripts/apply-google-enrich-report.mjs <report.json> [--min-confidence=0.51]');
    process.exit(1);
}
const minConfArg = args.find((a) => a.startsWith('--min-confidence'));
const MIN_CONFIDENCE = minConfArg ? parseFloat(minConfArg.split('=')[1]) : 0.51;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const toApply = report.filter((r) => r.status === 'matched' && r.confidence >= MIN_CONFIDENCE);
    const skipped = report.length - toApply.length;

    console.log(`Report rows: ${report.length}`);
    console.log(`Applying: ${toApply.length} (confidence >= ${MIN_CONFIDENCE})`);
    console.log(`Skipping (held for manual review): ${skipped}\n`);

    const { data: clubs, error } = await supabase.from('clubs').select('id, name');
    if (error) throw error;
    const byName = new Map(clubs.map((c) => [c.name, c.id]));

    let applied = 0;
    let missing = 0;
    for (const row of toApply) {
        const id = byName.get(row.club);
        if (!id) {
            missing += 1;
            console.error(`! no DB match for report row "${row.club}"`);
            continue;
        }
        const { error: updErr } = await supabase
            .from('clubs')
            .update({ ...row.fillIfEmpty, ...row.alwaysUpdate })
            .eq('id', id);
        if (updErr) {
            console.error(`! update failed for ${row.club}: ${updErr.message}`);
            continue;
        }
        applied += 1;
    }

    console.log(`\nDone. applied=${applied} missing=${missing}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
