import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_SERVICE_ROLE_KEY
);

async function run() {
    try {
        const { data, error } = await supabase
            .from('admin_sidebar_permissions')
            .select('*');
        if (error) throw error;
        console.log("Current Admin Sidebar Permissions:");
        console.log(JSON.stringify(data, null, 2));
    } catch (err) {
        console.error("Error inspecting admins:", err);
    }
}
run();
