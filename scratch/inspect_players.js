import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
    const eventId = 381;
    const names = ["Victor Dercksen", "Edwin Loubser"];

    console.log("=== 1. TOURNAMENT PARTICIPANTS ===");
    const { data: participants, error: pError } = await supabase
        .from('tournament_participants')
        .select('*')
        .eq('event_id', eventId);
    
    if (pError) console.error("Error fetching participants:", pError);
    else {
        const filtered = participants.filter(p => 
            names.some(name => p.full_name && p.full_name.toLowerCase().includes(name.toLowerCase().split(' ')[0]))
        );
        console.log("Filtered participants:", JSON.stringify(filtered, null, 2));
    }

    console.log("=== 2. EVENT REGISTRATIONS ===");
    const { data: registrations, error: rError } = await supabase
        .from('event_registrations')
        .select('*')
        .eq('event_id', eventId);

    if (rError) console.error("Error fetching registrations:", rError);
    else {
        const filtered = registrations.filter(r => 
            names.some(name => r.full_name && r.full_name.toLowerCase().includes(name.toLowerCase().split(' ')[0]))
        );
        console.log("Filtered registrations:", JSON.stringify(filtered, null, 2));
    }
}

run();
