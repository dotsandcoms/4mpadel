import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
    console.log("Fetching all players...");
    const { data: players, error } = await supabase
        .from('players')
        .select('id, name, rankings, active_ranking_label');

    if (error) {
        console.error("Error fetching players:", error);
        return;
    }

    console.log(`Fetched ${players.length} players. Scanning for mock rankings...`);
    let cleanCount = 0;

    for (const p of players) {
        let needsUpdate = false;
        let updatedRankings = p.rankings;
        let updatedActiveLabel = p.active_ranking_label;

        // Check if rankings contains empty org rankings
        if (p.rankings && Array.isArray(p.rankings) && p.rankings.length > 0) {
            const hasMock = p.rankings.some(r => r.org === "" || r.org === null || r.org === 'Ranking');
            if (hasMock) {
                console.log(`Player "${p.name}" has mock rankings. Cleaning...`);
                updatedRankings = [];
                needsUpdate = true;
            }
        }

        // Check if active_ranking_label is blank or placeholder
        if (p.active_ranking_label === " - Open" || p.active_ranking_label === " - OPEN" || (p.active_ranking_label && p.active_ranking_label.startsWith(" - "))) {
            updatedActiveLabel = null;
            needsUpdate = true;
        }

        if (needsUpdate) {
            const { error: updateError } = await supabase
                .from('players')
                .update({
                    rankings: updatedRankings,
                    active_ranking_label: updatedActiveLabel
                })
                .eq('id', p.id);

            if (updateError) {
                console.error(`Failed to clean player "${p.name}":`, updateError.message);
            } else {
                cleanCount++;
                console.log(`✓ Cleaned player "${p.name}"`);
            }
        }
    }

    console.log(`Database cleanup finished. Cleaned ${cleanCount} players.`);
}

run();
