import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
    console.error("Missing VITE_SUPABASE_URL. Check .env or GitHub Secrets.");
}
if (!supabaseKey) {
    console.error("Missing VITE_SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_ANON_KEY. Check .env or GitHub Secrets.");
}

if (!supabaseUrl || !supabaseKey) {
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
    realtime: {
        transport: WebSocket,
    },
});

/** Rankedin age-group IDs for the official SAPA Main (Open) lists. */
const SAPA_MEN_MAIN = 82;
const SAPA_WOMEN_MAIN = 83;
const SAPA_MAIN_AGE_GROUPS = new Set([SAPA_MEN_MAIN, SAPA_WOMEN_MAIN]);

/**
 * Only Main (or an explicitly preferred category) may write players.points /
 * rank_label. Other age groups still sync rankedin_id + cache, but must not
 * stomp the profile points shown on Players / EventDetails seeding.
 *
 * Women → Women-Main (83). Men → Men-Main (82).
 */
const shouldWriteFlatPoints = (rankingId, ageGroup, preferredRanking, rankingType) => {
    const preferred = (preferredRanking || '').toLowerCase();

    if (!preferred) {
        // Default profile points = gendered SAPA Main only
        if (rankingId !== 15809) return false;
        if (rankingType === 4) return ageGroup === SAPA_WOMEN_MAIN; // Women
        if (rankingType === 3) return ageGroup === SAPA_MEN_MAIN;   // Men
        return SAPA_MAIN_AGE_GROUPS.has(ageGroup);
    }

    if (rankingId === 15809 && preferred.includes('sapa')) {
        // Explicit Women-Main preference
        if (preferred.includes('women-main') || preferred.includes('ladies') || preferred.includes('women')) {
            if (preferred.includes('over')) {
                // age-band preference handled below
            } else {
                return ageGroup === SAPA_WOMEN_MAIN;
            }
        }
        // Explicit Men-Main preference
        if (preferred.includes('men-main') || (preferred.includes('men') && !preferred.includes('women'))) {
            if (!preferred.includes('over') && (preferred.includes('main') || preferred.includes('open') || !/over\s*\d/.test(preferred))) {
                // If it's clearly men main/open or generic men sapa without age band
                if (preferred.includes('men-main') || preferred.includes('main') || preferred.includes('open') || !/over\s*\d/.test(preferred)) {
                    if (!/over\s*\d/.test(preferred)) return ageGroup === SAPA_MEN_MAIN;
                }
            }
        }

        const mentionsAgeBand = /over\s*\d|junior|u1|u2|mixed-main/.test(preferred);
        if (!mentionsAgeBand) {
            if (preferred.includes('women') || preferred.includes('ladies')) return ageGroup === SAPA_WOMEN_MAIN;
            if (preferred.includes('men')) return ageGroup === SAPA_MEN_MAIN;
            // rankingType from the sync loop is the safest gendered default
            if (rankingType === 4) return ageGroup === SAPA_WOMEN_MAIN;
            if (rankingType === 3) return ageGroup === SAPA_MEN_MAIN;
            return SAPA_MAIN_AGE_GROUPS.has(ageGroup);
        }

        if (preferred.includes('mixed-main') || preferred.includes('mixed')) {
            return ageGroup === 84;
        }
        if (preferred.includes('over 35') || preferred.includes('over35')) return ageGroup === 2;
        if (preferred.includes('over 40') || preferred.includes('over40')) return ageGroup === 3 || ageGroup === 4;
        if (preferred.includes('over 45') || preferred.includes('over45')) return ageGroup === 4 || ageGroup === 5;
        if (preferred.includes('over 50') || preferred.includes('over50')) return ageGroup === 5;
        if (preferred.includes('over 55') || preferred.includes('over55')) return ageGroup === 6;

        if (rankingType === 4) return ageGroup === SAPA_WOMEN_MAIN;
        if (rankingType === 3) return ageGroup === SAPA_MEN_MAIN;
        return SAPA_MAIN_AGE_GROUPS.has(ageGroup);
    }

    if (rankingId === 16317 && preferred.includes('broll')) return true;
    if (rankingId === 16482 && (preferred.includes('grand tour') || preferred.includes('sa grand'))) return true;

    return false;
};


async function getValidAgeGroups(rankingId, type) {
    const validGroups = [];
    // Checking a broad range of standard Rankedin ageGroups (1-100)
    // Run in batches to avoid overwhelming the API
    const checks = Array.from({length: 100}, (_, i) => i + 1);
    
    for (let i = 0; i < checks.length; i += 10) {
        const batch = checks.slice(i, i + 10);
        await Promise.all(batch.map(async (ageGroup) => {
            const url = `https://api.rankedin.com/v1/Ranking/GetRankingsAsync?rankingId=${rankingId}&rankingType=${type}&ageGroup=${ageGroup}&weekFromNow=0&language=en&skip=0&take=1`;
            try {
                const res = await fetch(url);
                if (res.ok) {
                    const data = await res.json();
                    if (data.Payload && data.Payload.length > 0) {
                        validGroups.push(ageGroup);
                    }
                }
            } catch (e) {
                // ignore
            }
        }));
    }
    return validGroups.sort((a,b)=>a-b);
}


async function syncCategory(rankingId, type, ageGroup, categoryName) {
    console.log(`\n--- Syncing ${categoryName} (Ranking ID: ${rankingId}) ---`);
    const url = `https://api.rankedin.com/v1/Ranking/GetRankingsAsync?rankingId=${rankingId}&rankingType=${type}&ageGroup=${ageGroup}&weekFromNow=0&language=en&skip=0&take=1000`;

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const data = await res.json();
        const players = data.Payload || [];

        console.log(`Found ${players.length} players in ${categoryName} on Rankedin.`);

        // --- SAVE TO RANKEDIN_CACHE TABLE ---
        const { error: cacheError } = await supabase
            .from('rankedin_cache')
            .upsert({
                url: url,
                payload: data,
                updated_at: new Date().toISOString()
            }, { onConflict: 'url' });

        if (cacheError) {
            console.error(`Failed to cache rankings in DB:`, cacheError.message);
        } else {
            console.log(`✓ Cached raw rankings in Supabase: ${url}`);
        }

        let updateCount = 0;
        let skipCount = 0;

        for (const p of players) {
            const name = p.Name;
            const points = Math.round(parseFloat(p.ParticipantPoints?.Points) || 0);
            const rank = p.Standing;
            const rankedinId = p.RankedinId || p.Participant?.Id;
            const profileUrl = p.ParticipantUrl ? `https://www.rankedin.com${p.ParticipantUrl}` : null;

            let playerToUpdate = null;

            // 1. Try finding by Rankedin ID first
            if (rankedinId) {
                const { data: idMatch } = await supabase
                    .from('players')
                    .select('id, name, preferred_ranking, rankedin_id')
                    .eq('rankedin_id', rankedinId.toString())
                    .eq('approved', true)
                    .maybeSingle();

                if (idMatch) {
                    playerToUpdate = idMatch;
                }
            }

            // 2. Fallback to Name matching if no ID match found
            if (!playerToUpdate) {
                const nameParts = name.split(/\s+/).filter(Boolean);
                let query = supabase
                    .from('players')
                    .select('id, name, preferred_ranking, rankedin_id')
                    .eq('approved', true);
                
                // Add an ilike for each part of the name
                nameParts.forEach(part => {
                    query = query.ilike('name', "%" + part + "%");
                });

                const { data: nameMatches } = await query;

                if (nameMatches && nameMatches.length > 0) {
                    playerToUpdate = nameMatches.find(ep => ep.name.replace(/\s+/g, ' ').trim().toLowerCase() === name.replace(/\s+/g, ' ').trim().toLowerCase()) || nameMatches[0];
                }
            }

            if (playerToUpdate) {
                const writeFlatPoints = shouldWriteFlatPoints(
                    rankingId,
                    ageGroup,
                    playerToUpdate.preferred_ranking,
                    type
                );

                if (!writeFlatPoints) {
                    // Keep Rankedin ID linked, but never overwrite Main profile points
                    // with an age-group / secondary list.
                    if (!playerToUpdate.rankedin_id && rankedinId) {
                        await supabase.from('players').update({ rankedin_id: rankedinId.toString() }).eq('id', playerToUpdate.id);
                    }
                    skipCount++;
                    continue;
                }

                const updateData = {
                    points: points,
                    rank_label: rank.toString(),
                    rankedin_id: rankedinId ? rankedinId.toString() : null
                };
                if (profileUrl) {
                    updateData.rankedin_profile_url = profileUrl;
                }

                const { error: updateError } = await supabase
                    .from('players')
                    .update(updateData)
                    .eq('id', playerToUpdate.id);

                if (updateError) {
                    console.error(`Failed to update ${name}:`, updateError.message);
                } else {
                    updateCount++;
                }
            } else {
                skipCount++;
            }
        }
        console.log(`Results for ${categoryName} (ID: ${rankingId}): ${updateCount} updated, ${skipCount} skipped/not preferred.`);
    } catch (err) {
        console.error(`Error syncing ${categoryName}:`, err.message);
    }
}


async function run() {
    const mainOnly = process.argv.includes('--main-only');
    console.log(mainOnly
        ? 'Starting Rankedin Sync: SAPA Men-Main + Women-Main only…'
        : 'Starting Rankedin Sync for all featured rankings and all categories…');

    if (mainOnly) {
        await syncCategory(15809, 3, 82, "SAPA Men's Main");
        await syncCategory(15809, 4, 83, "SAPA Women's Main");
        console.log('\nMain-only sync finished.');
        return;
    }
    
    const rankingsToSync = [
        { id: 15809, name: 'SAPA' },
        { id: 16317, name: 'Broll Pro Tour' },
        { id: 16482, name: 'SA Grand Tour' }
    ];

    for (const ranking of rankingsToSync) {
        console.log(`\n=== Discovering Categories for ${ranking.name} ===`);
        // Type 3 = Men, Type 4 = Women
        const menAgeGroups = await getValidAgeGroups(ranking.id, 3);
        console.log(`Found Men's Age Groups: ${menAgeGroups.join(', ')}`);
        
        for (const ageGroup of menAgeGroups) {
            await syncCategory(ranking.id, 3, ageGroup, `${ranking.name} Men's (Category ID ${ageGroup})`);
        }

        const womenAgeGroups = await getValidAgeGroups(ranking.id, 4);
        console.log(`Found Women's Age Groups: ${womenAgeGroups.join(', ')}`);
        
        for (const ageGroup of womenAgeGroups) {
            await syncCategory(ranking.id, 4, ageGroup, `${ranking.name} Women's (Category ID ${ageGroup})`);
        }
    }

    console.log("\nAll sync tasks finished.");
}


run();
