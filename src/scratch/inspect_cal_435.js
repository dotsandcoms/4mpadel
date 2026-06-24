import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkCalendar() {
    const { data, error } = await supabase
        .from('calendar')
        .select('*')
        .eq('id', 435)
        .single();
    
    if (error) console.error(error);
    else console.log(JSON.stringify(data, null, 2));
}

checkCalendar();
