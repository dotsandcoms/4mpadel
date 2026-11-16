import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.3';
import { createRecoveryHandler } from './handler.mjs';
const publishable = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}');
Deno.serve(createRecoveryHandler({ createClient,
  url: Deno.env.get('SUPABASE_URL') || '',
  key: publishable.default || Deno.env.get('SUPABASE_ANON_KEY') || '',
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
  reportError: (stage: string, reference?: string) => console.error(stage, reference || ''),
}));
