/**
 * One-shot repair: rewrite players.points / rank_label / active_ranking_label
 * from the SAPA Main (Open) entry already stored in players.rankings JSON.
 *
 * Fixes rows stomped by syncRankedinRankings writing every age-group list
 * into the flat points column.
 *
 * Usage: node scripts/repairPlayerMainPoints.js
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase env (VITE_SUPABASE_URL + service/anon key).');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const isMainAgeGroup = (r) => {
    const age = (r.age_group || '').toUpperCase();
    return !age || age.includes('OPEN') || age.includes('MAIN');
};

const isMixedRanking = (r) => {
    const age = (r.age_group || '').toUpperCase();
    const match = (r.match_type || '').toUpperCase();
    return age.includes('MIXED') || match.includes('MIXED');
};

const isWomenRanking = (r) => {
    const blob = `${r.age_group || ''} ${r.match_type || ''} ${r.org || ''}`.toUpperCase();
    return blob.includes('WOMEN') || blob.includes('LADIES') || blob.includes('FEMALE');
};

const isMenRanking = (r) => {
    const blob = `${r.age_group || ''} ${r.match_type || ''}`.toUpperCase();
    // "Men" but not "Women"
    return (blob.includes('MEN') || blob.includes('MALE')) && !isWomenRanking(r) && !isMixedRanking(r);
};

/** Infer player gender from profile fields + ranking entries. */
const inferGender = (player, rankings = []) => {
    const blob = [
        player?.category,
        player?.age_group,
        player?.preferred_ranking,
        player?.active_ranking_label,
    ].filter(Boolean).join(' ').toUpperCase();

    if (blob.includes('WOMEN') || blob.includes('LADIES') || blob.includes('FEMALE')) return 'women';
    if (blob.includes('MEN') && !blob.includes('WOMEN')) return 'men';

    const sapa = (rankings || []).filter((r) => (r.org || '').toUpperCase().includes('SAPA'));
    const hasWomen = sapa.some(isWomenRanking);
    const hasMen = sapa.some(isMenRanking);
    if (hasWomen && !hasMen) return 'women';
    if (hasMen && !hasWomen) return 'men';
    return null;
};

/**
 * Pick the ranking entry that should drive the flat profile points column.
 * Women → SAPA Women-Main; Men → SAPA Men-Main; never Mixed by default.
 */
const pickDisplayRanking = (rankings, player) => {
    if (!Array.isArray(rankings) || rankings.length === 0) return null;

    const preferredRanking = player?.preferred_ranking;
    if (preferredRanking) {
        const preferred = rankings.find(
            (r) => `${r.org}|${r.age_group}|${r.match_type}` === preferredRanking
        );
        if (preferred) return preferred;
    }

    const sapa = rankings.filter((r) => (r.org || '').toUpperCase().includes('SAPA'));
    if (sapa.length === 0) return rankings[0];

    const gender = inferGender(player, rankings);
    const mainNonMixed = sapa.filter((r) => isMainAgeGroup(r) && !isMixedRanking(r));

    if (gender === 'women') {
        return (
            mainNonMixed.find(isWomenRanking) ||
            sapa.find((r) => isWomenRanking(r) && isMainAgeGroup(r)) ||
            sapa.find(isWomenRanking) ||
            mainNonMixed[0] ||
            [...sapa].sort((a, b) => (b.details?.length || 0) - (a.details?.length || 0))[0]
        );
    }

    if (gender === 'men') {
        return (
            mainNonMixed.find(isMenRanking) ||
            sapa.find((r) => isMenRanking(r) && isMainAgeGroup(r)) ||
            sapa.find(isMenRanking) ||
            mainNonMixed[0] ||
            [...sapa].sort((a, b) => (b.details?.length || 0) - (a.details?.length || 0))[0]
        );
    }

    // Unknown gender: still prefer gendered Main over Mixed
    return (
        mainNonMixed.find(isMenRanking) ||
        mainNonMixed.find(isWomenRanking) ||
        mainNonMixed[0] ||
        [...sapa].sort((a, b) => (b.details?.length || 0) - (a.details?.length || 0))[0]
    );
};

async function run() {
    console.log('Repairing players.points from rankings JSON (SAPA Main)…');

    let updated = 0;
    let skipped = 0;
    let unchanged = 0;
    const PAGE = 500;

    for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
            .from('players')
            .select('id, name, points, rank_label, preferred_ranking, rankings, active_ranking_label, category, age_group')
            .range(from, from + PAGE - 1);

        if (error) {
            console.error('Fetch failed:', error.message);
            process.exit(1);
        }
        if (!data?.length) break;

        for (const player of data) {
            const selected = pickDisplayRanking(player.rankings, player);
            if (!selected?.points) {
                skipped++;
                continue;
            }

            const nextPoints = parseInt(selected.points, 10) || 0;
            const nextRank = selected.rank != null ? String(selected.rank) : player.rank_label;
            const nextLabel = `${selected.org} - ${selected.age_group || 'Open'}`;

            if (
                Number(player.points) === nextPoints &&
                String(player.rank_label || '') === String(nextRank || '') &&
                String(player.active_ranking_label || '') === nextLabel
            ) {
                unchanged++;
                continue;
            }

            const { error: updateError } = await supabase
                .from('players')
                .update({
                    points: nextPoints,
                    rank_label: nextRank,
                    active_ranking_label: nextLabel,
                })
                .eq('id', player.id);

            if (updateError) {
                console.error(`Failed ${player.name}:`, updateError.message);
            } else {
                console.log(
                    `✓ ${player.name}: ${player.points} → ${nextPoints} (${nextLabel})`
                );
                updated++;
            }
        }

        if (data.length < PAGE) break;
    }

    console.log(`\nDone. Updated ${updated}, unchanged ${unchanged}, skipped ${skipped}.`);
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
