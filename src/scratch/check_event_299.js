
import { createClient } from '@supabase/supabase-client';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkEvent() {
    const { data, error } = await supabase
        .from('calendar')
        .select('id, event_name, entry_fee')
        .eq('id', 299)
        .maybeSingle();
    
    if (error) console.error(error);
    else console.log(data);
}

checkEvent();
