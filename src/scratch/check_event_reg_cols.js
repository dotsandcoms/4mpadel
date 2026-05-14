
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function checkSchema() {
    const { data, error } = await supabase.from('event_registrations').select('*').limit(1);
    if (error) {
        console.error("Error fetching event_registrations:", error.message);
        // If it's a column error, it might not return data but the error message will be different
    } else if (data && data.length > 0) {
        console.log("Columns found:", Object.keys(data[0]));
    } else {
        console.log("No data in event_registrations to check columns.");
    }
}

checkSchema();
