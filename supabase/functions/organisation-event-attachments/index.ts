import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.3';
import { createAttachmentHandler } from './handler.mjs';

const publishableKeys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}');
Deno.serve(createAttachmentHandler({
    createClient,
    url: Deno.env.get('SUPABASE_URL') || '',
    key: publishableKeys.default || Deno.env.get('SUPABASE_ANON_KEY') || '',
    serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
}));
