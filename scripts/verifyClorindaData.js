import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function verify() {
    console.log("Verifying data for Clorinda Wessels...");
    const { data, error } = await supabase
        .from('players')
        .select('name, skill_rating, age, match_form, rankings, rankedin_id')
        .eq('name', 'Clorinda Wessels')
        .single();

    if (error) {
        console.error("Error:", error.message);
    } else {
        console.log(JSON.stringify(data, null, 2));
    }
}

verify();
