import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleProvider } from './handler.mjs';

Deno.serve(request => handleProvider(request, {
  secret: Deno.env.get('PADEL_API_TOKEN'),
  client: createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } }),
}));
