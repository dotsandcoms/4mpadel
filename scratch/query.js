import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
    const { data: pData } = await supabase.from('tournament_participants').select('*').limit(5);
    console.log("participants sample:", pData);
    
    // check if is_paid is null anywhere
    const { data: nullPaid } = await supabase.from('tournament_participants').select('*').is('is_paid', null).limit(5);
    console.log("null is_paid sample:", nullPaid);
}
run();
