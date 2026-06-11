import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials in .env");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const API_BASE = 'https://api.rankedin.com/v1';

async function fetchWithRetry(url, options = {}, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url, options);
            if (!res.ok) {
                if (res.status === 429) {
                    console.log(`Rate limited on ${url}, waiting 5 seconds...`);
                    await new Promise(r => setTimeout(r, 5000));
                    continue;
                }
                throw new Error(`HTTP ${res.status}`);
            }
            return await res.json();
        } catch (err) {
            if (i === retries - 1) throw err;
            await new Promise(r => setTimeout(r, 2000));
        }
    }
}

async function getAnonToken() {
    console.log("Fetching anonymous token from Rankedin...");
    const res = await fetchWithRetry(`${API_BASE}/player/getlayoutinfoasync?language=en`);
    return res.AnonymousToken;
}

async function run() {
    console.log("Starting Player Matches Synchronization...");
    try {
        const { data: players, error } = await supabase
            .from('players')
            .select('id, name, rankedin_id')
            .not('rankedin_id', 'is', null);

        if (error) throw error;

        console.log(`Found ${players.length} players with a Rankedin ID.`);

        const token = await getAnonToken();
        const headers = token ? { 'x-anonymous-token': token, 'Accept': 'application/json' } : { 'Accept': 'application/json' };

        for (let i = 0; i < players.length; i++) {
            const player = players[i];
            console.log(`[${i+1}/${players.length}] Syncing matches for ${player.name} (${player.rankedin_id})...`);

            try {
                // Step 1: Get internal PlayerId
                const profileData = await fetchWithRetry(`${API_BASE}/player/playerprofileinfoasync?rankedinId=${player.rankedin_id}&language=en`);
                const internalId = profileData.Id || profileData.Header?.PlayerId;

                if (!internalId) {
                    throw new Error("Could not extract internal PlayerId");
                }

                // Step 2: Fetch Matches
                const upcomingRaw = await fetchWithRetry(`${API_BASE}/player/GetPlayerMatchesAsync?playerid=${internalId}&takehistory=false&skip=0&take=20&language=en`, { headers });
                const historyRaw = await fetchWithRetry(`${API_BASE}/player/GetPlayerMatchesAsync?playerid=${internalId}&takehistory=true&skip=0&take=30&language=en`, { headers });

                const upcoming = upcomingRaw?.Payload || [];
                const history = historyRaw?.Payload || [];

                const { error: upsertError } = await supabase
                    .from('player_matches')
                    .upsert({
                        rankedin_id: player.rankedin_id,
                        upcoming_matches: upcoming,
                        past_matches: history,
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'rankedin_id' });

                if (upsertError) {
                    console.error(`  -> Supabase Upsert Error for ${player.name}:`, upsertError.message);
                } else {
                    console.log(`  -> Success. Upcoming: ${upcoming.length}, Past: ${history.length}`);
                }
            } catch (err) {
                console.error(`  -> Failed to sync ${player.name}:`, err.message);
            }

            // Sleep to avoid hammering Rankedin API
            await new Promise(r => setTimeout(r, 1000));
        }

        console.log("Synchronization complete!");
        process.exit(0);
    } catch (err) {
        console.error("Fatal Error during sync:", err);
        process.exit(1);
    }
}

run();
