
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkSchema() {
    const { data } = await supabase.from('calendar').select('*').limit(1);
    if (data && data.length > 0) {
        console.log("Calendar Columns:", Object.keys(data[0]));
    }
}

checkSchema();
