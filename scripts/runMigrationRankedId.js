import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY);

async function runMigration() {
    const { error } = await supabase.rpc('run_sql', {
        sql: 'ALTER TABLE players ADD COLUMN IF NOT EXISTS rankedin_id text;'
    });
    if (error) {
        // If RPC is not available, try to help the user
        console.error("Error adding column via RPC. Please ensure you have have the 'run_sql' function enabled or run the SQL manually in the Supabase editor.");
        console.log("SQL: ALTER TABLE players ADD COLUMN IF NOT EXISTS rankedin_id text;");
    } else {
        console.log("Successfully added rankedin_id column.");
    }
}

runMigration();
