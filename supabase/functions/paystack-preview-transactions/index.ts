import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createHandler, hasPlatformAccess } from './handler.js';

serve(createHandler({
  authenticate: async (authorization: string) => {
    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authorization } }, auth: { persistSession: false },
    });
    const { data, error } = await client.auth.getUser();
    return error ? null : data.user;
  },
  authorize: async (email: string) => {
    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false },
    });
    return hasPlatformAccess(client, email);
  },
  getSecret: (mode: string) => Deno.env.get(mode === 'test' ? 'PAYSTACK_SECRET_KEY_TEST' : 'PAYSTACK_SECRET_KEY'),
}));
