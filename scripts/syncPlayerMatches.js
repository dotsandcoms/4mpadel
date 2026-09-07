import { createClient } from '@supabase/supabase-js';
import { createHistoryRepair, isRealHistory, preserveHistoryScores } from './lib/matchCacheRepair.js';
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
    throw new Error(`RankedIn retries exhausted: ${url}`);
}

async function getAnonToken() {
    console.log("Fetching anonymous token from Rankedin...");
    const res = await fetchWithRetry(`${API_BASE}/player/getlayoutinfoasync?language=en`);
    return res.AnonymousToken;
}

async function run() {
    console.log("Starting Player Matches Synchronization...");
    try {
        // Paginate past PostgREST's default 1000-row cap.
        const pageSize = 1000;
        let players = [];
        let from = 0;
        while (true) {
            const { data: page, error } = await supabase
                .from('players')
                .select('id, name, rankedin_id')
                .not('rankedin_id', 'is', null)
                .order('id', { ascending: true })
                .range(from, from + pageSize - 1);
            if (error) throw error;
            if (!page?.length) break;
            players = players.concat(page);
            if (page.length < pageSize) break;
            from += pageSize;
        }

        console.log(`Found ${players.length} players with a Rankedin ID.`);

        const events = [];
        for (let offset = 0; ; offset += 1000) {
            const { data, error } = await supabase.from('calendar').select('event_name,rankedin_id').order('id').range(offset, offset + 999);
            if (error) throw error;
            events.push(...data);
            if (data.length < 1000) break;
        }
        const repairHistory = createHistoryRepair(events, fetchWithRetry);
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

                const { data: saved, error: cacheError } = await supabase.from('player_matches')
                    .select('past_matches,past_matches_updated_at,upcoming_matches_updated_at,updated_at').eq('rankedin_id', player.rankedin_id).maybeSingle();
                if (cacheError) throw cacheError;
                const hasLiveHistory = isRealHistory(historyRaw?.Payload);
                const history = preserveHistoryScores(historyRaw?.Payload, saved?.past_matches);
                const repaired = await repairHistory(history);
                const upcoming = upcomingRaw?.Payload;
                const validUpcoming = Array.isArray(upcoming) && (upcoming.length === 0 || isRealHistory(upcoming));
                const nowIso = new Date().toISOString();
                const update = { rankedin_id: player.rankedin_id, updated_at: nowIso };
                if (saved && !hasLiveHistory) {
                    update.past_matches_updated_at = saved.past_matches_updated_at || saved.updated_at || new Date(0).toISOString();
                }
                if (saved && !validUpcoming) {
                    update.upcoming_matches_updated_at = saved.upcoming_matches_updated_at || saved.updated_at || new Date(0).toISOString();
                }
                if (validUpcoming) {
                    update.upcoming_matches = upcoming;
                    update.upcoming_matches_updated_at = nowIso;
                }
                if (hasLiveHistory || repaired.repaired) {
                    update.past_matches = repaired.matches;
                    // A score repair is not a full history refresh.
                    if (hasLiveHistory) update.past_matches_updated_at = nowIso;
                }
                if (!validUpcoming && !hasLiveHistory && !repaired.repaired) {
                    console.warn('  -> No valid live data; preserving saved matches.');
                    continue;
                }
                const { error: upsertError } = await supabase
                    .from('player_matches')
                    .upsert(update, { onConflict: 'rankedin_id' });

                if (upsertError) {
                    console.error(`  -> Supabase Upsert Error for ${player.name}:`, upsertError.message);
                } else {
                    console.log(`  -> Success. Upcoming: ${validUpcoming ? upcoming.length : "preserved"}, Past: ${repaired.matches.length}, Scores repaired: ${repaired.repaired}`);
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
