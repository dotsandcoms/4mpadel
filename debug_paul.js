import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env') });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    console.log("Checking Paul Anderson (ID: 360)...");
    const { data, error } = await supabase.from('players').select('*').eq('id', 360).single();
    if (error) {
        console.error("Error:", error.message);
    } else {
        console.log("Player Name:", data.name);
        console.log("Skill Rating:", data.skill_rating);
        console.log("Points:", data.points);
        console.log("RankedIn ID:", data.rankedin_id);
        console.log("RankedIn URL:", data.rankedin_profile_url);
        console.log("Full Object:", JSON.stringify(data, null, 2));
    }
}

check().catch(console.error);
