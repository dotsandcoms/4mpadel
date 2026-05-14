
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkEvent() {
    console.log("Checking ID 299...");
    const { data: byId } = await supabase.from('calendar').select('id, event_name, rankedin_id').eq('id', 299).maybeSingle();
    console.log("By ID:", byId);

    console.log("Checking Rankedin ID 299...");
    const { data: byRID } = await supabase.from('calendar').select('id, event_name, rankedin_id').eq('rankedin_id', '299').maybeSingle();
    console.log("By Rankedin ID:", byRID);
}

checkEvent();
