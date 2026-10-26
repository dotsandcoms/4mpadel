import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.112.3';
import { createDeletionHandler } from './handler.mjs';
import { revokeAppleAuthorization } from './apple.mjs';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
Deno.serve(createDeletionHandler({ admin,
  revokeApple: (code: string, subject: string) => revokeAppleAuthorization(code, subject, (name: string) => Deno.env.get(name)),
}));
