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

const RANKING_ID = 15809; // SAPA Main Ranking

async function syncCategory(type, ageGroup, categoryName) {
    console.log(`\n--- Syncing ${categoryName} ---`);
    const url = `https://api.rankedin.com/v1/Ranking/GetRankingsAsync?rankingId=${RANKING_ID}&rankingType=${type}&ageGroup=${ageGroup}&weekFromNow=0&language=en&skip=0&take=1000`;

    try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        const data = await res.json();
        const players = data.Payload || [];

        console.log(`Found ${players.length} players in ${categoryName} on Rankedin.`);

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
                    .select('id, name')
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
                    .select('id, name')
                    .ilike('name', `%${name}%`)
                    .eq('approved', true);

                if (nameMatches && nameMatches.length > 0) {
                    // Critical: Must match exactly if we have multiple, or just pick the best one
                    playerToUpdate = nameMatches.find(ep => ep.name.toLowerCase() === name.toLowerCase()) || nameMatches[0];
                }
            }

            if (playerToUpdate) {
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
                    // console.log(`✓ Updated ${name} (Rank: ${rank}, Points: ${points})`);
                }
            } else {
                skipCount++;
                // console.log(`× Player ${name} not found in our database.`);
            }
        }
        console.log(`Results for ${categoryName}: ${updateCount} updated, ${skipCount} not found in DB.`);
    } catch (err) {
        console.error(`Error syncing ${categoryName}:`, err.message);
    }
}

async function run() {
    console.log("Starting Rankedin Sync...");
    await syncCategory(3, 82, "Men's Open");
    await syncCategory(4, 83, "Women's Open");
    console.log("\nAll sync tasks finished.");
}

run();
