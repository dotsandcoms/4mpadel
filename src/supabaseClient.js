import { createClient } from '@supabase/supabase-js'

// Connects to Supabase on any domain - set in Vercel: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_KEY

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '')
