import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
    // Let's find players that have non-empty/non-null rankings
    const { data: players, error } = await supabase
        .from('players')
        .select('name, rankings, preferred_ranking, active_ranking_label, approved, paid_registration')
        .not('rankings', 'is', null);

    if (error) {
        console.error("Error:", error);
        return;
    }

    const playersWithRankings = players.filter(p => p.rankings && p.rankings.length > 0);
    console.log(`Total players with non-empty rankings: ${playersWithRankings.length} out of ${players.length}`);

    console.log("\nSample players with non-empty rankings:");
    playersWithRankings.slice(0, 10).forEach(p => {
        console.log(`\nPlayer: ${p.name}`);
        console.log(`Approved: ${p.approved}, Paid: ${p.paid_registration}`);
        console.log(`Preferred Ranking: ${p.preferred_ranking}`);
        console.log(`Active Label: ${p.active_ranking_label}`);
        console.log(`Rankings:`, JSON.stringify(p.rankings, null, 2));
    });
}
run();
