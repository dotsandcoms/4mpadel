import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase configuration. Check .env file.");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

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
            const rankedinId = p.Participant?.Id || p.RankedinId;

            // Try to find the player in our DB
            // We check by Rankedin ID first, then fallback to Name matching
            let query = supabase.from('players').select('id, name');

            if (rankedinId) {
                query = query.or(`rankedin_id.eq.${rankedinId},name.ilike.%${name}%`);
            } else {
                query = query.ilike('name', `%${name}%`);
            }

            const { data: existingPlayers, error } = await query;

            if (error) {
                console.error(`Error searching for ${name}:`, error.message);
                continue;
            }

            if (existingPlayers && existingPlayers.length > 0) {
                // If multiple found (rare but possible with name matching), use the best match
                const playerToUpdate = existingPlayers.find(ep => ep.name.toLowerCase() === name.toLowerCase()) || existingPlayers[0];

                const { error: updateError } = await supabase
                    .from('players')
                    .update({
                        points: points,
                        rank_label: rank.toString(),
                        rankedin_id: rankedinId ? rankedinId.toString() : null
                    })
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
