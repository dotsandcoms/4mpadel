
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkTim() {
    const { data: participants } = await supabase.from('tournament_participants')
        .select('id, class_name, is_paid')
        .eq('profile_id', 429)
        .eq('event_id', 299);
    
    console.log("Participants for Event 299:", participants);
}

checkTim();
