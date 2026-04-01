import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function checkColumns() {
    console.log('Checking columns in "calendar" table...');
    const { data, error } = await supabase.from('calendar').select('rankedin_id').limit(1);
    
    if (error) {
        console.error('Error selecting "rankedin_id":', error.message);
        if (error.message.includes('column "rankedin_id" does not exist')) {
            console.log('Column "rankedin_id" does NOT exist.');
        }
    } else {
        console.log('Column "rankedin_id" EXISTS!');
    }
}

checkColumns();
