import { createClient } from '@supabase/supabase-js'

// TODO: Replace these with your actual Supabase project details
// You can find these in your Supabase Dashboard -> Project Settings -> API
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project-url.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
