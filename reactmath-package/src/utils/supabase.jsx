import { createClient } from '@supabase/supabase-js';

// Access environment variables from the parent application's Vite environment
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let defaultSupabase;

// An injected application client must not start a second session refresh loop.
export function getDefaultSupabase() {
    if (defaultSupabase === undefined) {
        defaultSupabase = (supabaseUrl && supabaseAnonKey)
            ? createClient(supabaseUrl, supabaseAnonKey)
            : null;
    }
    return defaultSupabase;
}
