
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://uzglrpbixubfijvjbtgz.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV6Z2xycGJpeHViZmlqdmpidGd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MTU4MTQsImV4cCI6MjA4NjE5MTgxNH0.ubHInj40UnMC0yCTwPEH8Bgq8ZcNkqzjusuZb5xZXf4';


if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase env vars');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugEvents() {
    const { data, error } = await supabase
        .from('events')
        .select('*')
        .limit(2);

    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Events Data:', JSON.stringify(data, null, 2));
    }
}

debugEvents();
