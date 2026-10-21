import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleDraws } from './handler.mjs';

const url = Deno.env.get('SUPABASE_URL')!;
const client = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
Deno.serve(request => handleDraws(request, {
  client,
  authenticate: async (req: Request) => {
    const authorization = req.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) return false;
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authorization } }, auth: { persistSession: false },
    });
    const { data, error } = await caller.auth.getUser();
    return !error && !!data.user;
  },
}));
