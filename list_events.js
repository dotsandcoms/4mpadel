import { createClient } from '@supabase/supabase-js';
const supabaseUrl = 'https://uzglrpbixubfijvjbtgz.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV6Z2xycGJpeHViZmlqdmpidGd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MTU4MTQsImV4cCI6MjA4NjE5MTgxNH0.ubHInj40UnMC0yCTwPEH8Bgq8ZcNkqzjusuZb5xZXf4';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const run = async () => {
    const { data, error } = await supabase
        .from('calendar')
        .select('id, event_name, slug, venue');

    if (error) {
        console.error(error);
        process.exit(1);
    }

    console.log(JSON.stringify(data, null, 2));
};

run();
