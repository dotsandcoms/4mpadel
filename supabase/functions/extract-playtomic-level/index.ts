import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { createHandler, DEFAULT_MODEL } from './handler.mjs';

const url = Deno.env.get('SUPABASE_URL')!;
Deno.serve(createHandler({
  userClient: (authorization: string) => createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } }, auth: { persistSession: false },
  }),
  adminClient: () => createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } }),
  apiKey: Deno.env.get('OPENAI_API_KEY'),
  model: Deno.env.get('PLAYTOMIC_EXTRACTION_MODEL') || DEFAULT_MODEL,
}));
