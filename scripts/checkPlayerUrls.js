import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    const { data, error } = await supabase.from('players').select('name, rankedin_profile_url').eq('approved', true);
    console.log(`Found ${data?.length || 0} approved players.`);
    data?.forEach(p => {
        console.log(`- ${p.name}: ${p.rankedin_profile_url || 'MISSING URL'}`);
    });
}
run();
