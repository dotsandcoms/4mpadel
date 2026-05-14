import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function setupTable() {
    console.log("Setting up nvs_scores table...");
    
    const { error } = await supabase.rpc('execute_sql', {
        sql_query: `
            CREATE TABLE IF NOT EXISTS nvs_scores (
                id TEXT PRIMARY KEY,
                scores JSONB NOT NULL,
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );

            -- Enable RLS
            ALTER TABLE nvs_scores ENABLE ROW LEVEL SECURITY;

            -- Drop existing policies if any
            DROP POLICY IF EXISTS "Allow public read access" ON nvs_scores;
            DROP POLICY IF EXISTS "Allow admins to update" ON nvs_scores;

            -- Allow anyone to read
            CREATE POLICY "Allow public read access" ON nvs_scores FOR SELECT USING (true);

            -- Allow admins to update
            CREATE POLICY "Allow admins to update" ON nvs_scores FOR ALL 
            USING (
                EXISTS (
                    SELECT 1 FROM admin_sidebar_permissions 
                    WHERE email = auth.jwt()->>'email'
                )
            );
        `
    });

    if (error) {
        if (error.message.includes("function execute_sql(text) does not exist")) {
            console.log("RPC execute_sql does not exist. Please run the SQL manually in Supabase dashboard:");
            console.log(`
            CREATE TABLE IF NOT EXISTS nvs_scores (
                id TEXT PRIMARY KEY,
                scores JSONB NOT NULL,
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
            ALTER TABLE nvs_scores ENABLE ROW LEVEL SECURITY;
            CREATE POLICY "Allow public read access" ON nvs_scores FOR SELECT USING (true);
            CREATE POLICY "Allow admins to update" ON nvs_scores FOR ALL 
            USING (
                EXISTS (
                    SELECT 1 FROM admin_sidebar_permissions 
                    WHERE email = auth.jwt()->>'email'
                )
            );
            `);
        } else {
            console.error("Error setting up table:", error);
        }
    } else {
        console.log("Table setup successfully (if RPC was available).");
    }
}

setupTable();
