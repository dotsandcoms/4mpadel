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
            const points = p.ParticipantPoints?.Points || 0;
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
                const { data: nameMatches } = await supabase
                    .from('players')
                    .select('id, name, preferred_ranking, rankedin_id')
                    .ilike('name', `%${name}%`)
                    .eq('approved', true);

                if (nameMatches && nameMatches.length > 0) {
                    playerToUpdate = nameMatches.find(ep => ep.name.toLowerCase() === name.toLowerCase()) || nameMatches[0];
                }
            }

            if (playerToUpdate) {
                // Determine if we should update this player's main label and points
                let shouldUpdateLabelAndPoints = false;
                
                if (!playerToUpdate.preferred_ranking) {
                    // If no preferred ranking is set, we only update using the main SAPA Ranking (15809)
                    shouldUpdateLabelAndPoints = (rankingId === 15809);
                } else {
                    const preferred = playerToUpdate.preferred_ranking.toLowerCase();
                    if (rankingId === 15809 && preferred.includes('sapa')) {
                        shouldUpdateLabelAndPoints = true;
                    } else if (rankingId === 16317 && preferred.includes('broll')) {
                        shouldUpdateLabelAndPoints = true;
                    } else if (rankingId === 16482 && (preferred.includes('grand tour') || preferred.includes('sa grand'))) {
                        shouldUpdateLabelAndPoints = true;
                    }
                }

                if (!shouldUpdateLabelAndPoints) {
                    // Update rankedin_id if missing, but skip rank/points since it isn't preferred
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
    console.log("Starting Rankedin Sync for all featured rankings...");
    // 15809: SAPA
    await syncCategory(15809, 3, 82, "SAPA Men's Open");
    await syncCategory(15809, 4, 83, "SAPA Women's Open");

    // 16317: Broll Pro Tour
    await syncCategory(16317, 3, 82, "Broll Men's Open");
    await syncCategory(16317, 4, 83, "Broll Women's Open");

    // 16482: SA Grand Tour
    await syncCategory(16482, 3, 82, "SA Grand Tour Men's Open");
    await syncCategory(16482, 4, 83, "SA Grand Tour Women's Open");

    console.log("\nAll sync tasks finished.");
}

run();
