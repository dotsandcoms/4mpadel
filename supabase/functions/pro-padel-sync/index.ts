import { handleRefresh } from './handler.mjs';

Deno.serve((request) => handleRefresh(request, {
  secret: Deno.env.get('PRO_PADEL_CRON_SECRET'),
  token: Deno.env.get('PADEL_API_TOKEN'),
  url: Deno.env.get('SUPABASE_URL'),
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
}));
