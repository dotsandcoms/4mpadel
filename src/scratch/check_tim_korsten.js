
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkTim() {
    const email = 'timmykorsten3@gmail.com';
    const { data: player } = await supabase.from('players').select('*').ilike('email', email).maybeSingle();
    if (!player) {
        console.log("Player not found by email:", email);
        return;
    }
    console.log("Player Found:", player.id, player.name);

    const { data: participants } = await supabase.from('tournament_participants')
        .select('*')
        .or(`profile_id.eq.${player.id},email.ilike.${email}`);
    
    console.log("Participants Found:", participants.length);
    participants.forEach(p => {
        console.log(` - ID: ${p.id}, Name: ${p.full_name}, ProfileID: ${p.profile_id}, Email: ${p.email}, Event: ${p.event_id}`);
    });
}

checkTim();
