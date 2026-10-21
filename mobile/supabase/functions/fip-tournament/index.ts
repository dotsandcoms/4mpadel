import { createClient } from 'npm:@supabase/supabase-js@2';
import { parseDocument } from 'npm:htmlparser2@12.0.0';
import { handleFipTournament } from './handler.mjs';
const url = Deno.env.get('SUPABASE_URL')!;
const client = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
let calendar: { loaded: number; events: Array<{ id: number }> } | null = null;
Deno.serve(request => handleFipTournament(request, {
  client, parseDocument,
  resolveEvent: async (id: number) => {
    if (!calendar || Date.now() - calendar.loaded > 300000) {
      const { data, error } = await client.storage.from('pro-padel').download('fip-calendar-v1.json');
      if (error || !data) throw new Error('Calendar unavailable');
      const payload = JSON.parse(await data.text());
      if (payload.version !== 1 || !Array.isArray(payload.tournaments)) throw new Error('Calendar unavailable');
      calendar = { loaded: Date.now(), events: payload.tournaments };
    }
    return calendar.events.find(event => event.id === id);
  },
  authenticate: async (req: Request) => {
    const authorization = req.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) return false;
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
    const { data, error } = await caller.auth.getUser();
    return !error && !!data.user;
  },
}));
