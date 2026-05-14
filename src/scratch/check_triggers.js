
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkTriggers() {
    console.log("Checking for triggers on tournament_participants...");
    const { data, error } = await supabase.rpc('get_table_triggers', { table_name: 'tournament_participants' });
    if (error) {
        console.error("Error fetching triggers:", error.message);
        // Fallback: check if we can see any triggers at all via a generic query if RPC doesn't exist
    } else {
        console.log("Triggers:", data);
    }
}

checkTriggers();
