import { createClient } from '@supabase/supabase-js'

// Connects to Supabase on any domain - set in .env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/[\r\n]/g, '').trim()
const supabaseAnonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_KEY || '').replace(/[\r\n]/g, '').trim()

const hasValidConfig = Boolean(supabaseUrl && supabaseAnonKey && supabaseAnonKey.length > 20)

if (!hasValidConfig) {
  console.error('[Supabase] Missing or invalid VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Create a .env file (see .env.example) and restart the dev server.')
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key-must-set-env'
)

export const isSupabaseConfigured = () => hasValidConfig
