import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function updateClorinda() {
    const { data, error } = await supabase
        .from('players')
        .update({ rankedin_profile_url: 'https://www.rankedin.com/en/player/R000335461/clorinda-wessels' })
        .eq('name', 'Clorinda Wessels');

    if (error) console.error(error);
    else console.log("Updated Clorinda Wessels profile URL");
}

updateClorinda();
