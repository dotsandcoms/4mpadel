import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info' };
const cache = new Map<string, { until: number; value: unknown }>();
const pending = new Map<string, Promise<unknown>>();
const attempts = new Map<string, number[]>();
const tournaments = new Map<number, { until: number; value: unknown }>();
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const id = (value: unknown) => Number.isSafeInteger(Number(value)) && Number(value) > 0 && Number(value) <= 2147483647;

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const auth = req.headers.get('authorization') || '';
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: 'Sign in to explore international matches and tournaments.' }, 401);
    const input = await req.json();
    const kind = input?.kind;
    const page = Number(input?.page ?? 1);
    if (!['live', 'match', 'stats', 'points', 'head-to-head', 'prediction', 'player-stats', 'tournament-matches', 'seasons', 'season-tournaments'].includes(kind) ||
      (!['live', 'seasons'].includes(kind) && !id(input?.id)) || !Number.isSafeInteger(page) || page < 1 || page > 20) return json({ error: 'Invalid request.' }, 400);
    if (kind === 'prediction' && (!Array.isArray(input.team_1) || !Array.isArray(input.team_2) ||
      input.team_1.length !== 2 || input.team_2.length !== 2 ||
      ![...input.team_1, ...input.team_2].every(id) || new Set([...input.team_1, ...input.team_2]).size !== 4 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.played_at || ''))) return json({ error: 'Invalid prediction request.' }, 400);
    const resourceId = Number(input?.id);
    const key = `${kind}:${['live', 'seasons'].includes(kind) ? '' : resourceId}:${['tournament-matches', 'season-tournaments'].includes(kind) ? page : kind === 'prediction' ? [...input.team_1, ...input.team_2, input.played_at].join(':') : ''}`;
    const cached = cache.get(key);
    if (cached && cached.until > Date.now()) return json(cached.value);
    // Allow a live-list burst and match detail tabs, but stop rapid manual reload loops.
    const recent = (attempts.get(user.id) || []).filter(time => Date.now() - time < 10000);
    if (recent.length >= 15) return json({ error: 'Please wait a moment before refreshing.' }, 429);
    attempts.set(user.id, [...recent, Date.now()]);
    if (attempts.size > 2000) attempts.clear();
    const token = Deno.env.get('PADEL_API_TOKEN');
    if (!token) return json({ error: 'International tour details are temporarily unavailable.' }, 503);
    let path = '';
    if (kind === 'live') path = 'live';
    if (kind === 'match') path = `matches/${resourceId}`;
    if (kind === 'stats') path = `matches/${resourceId}/stats`;
    if (kind === 'points') path = `matches/${resourceId}/live`;
    if (kind === 'head-to-head') path = `matches/${resourceId}/headtohead`;
    if (kind === 'player-stats') path = `players/${resourceId}/stats`;
    if (kind === 'prediction') path = 'matches/simulate';
    if (kind === 'tournament-matches') path = `tournaments/${resourceId}/matches`;
    if (kind === 'seasons') path = 'seasons';
    if (kind === 'season-tournaments') path = `seasons/${resourceId}/tournaments`;
    const url = new URL(`https://padelapi.org/api/${path}`);
    if (kind === 'tournament-matches') { url.searchParams.set('page', String(page)); url.searchParams.set('per_page', '50'); url.searchParams.set('draw', 'all'); }
    if (kind === 'seasons' || kind === 'season-tournaments') { url.searchParams.set('page', String(page)); url.searchParams.set('per_page', '50'); }
    if (kind === 'head-to-head') url.searchParams.set('per_page', '50');
    if (kind === 'live') url.searchParams.set('per_page', '50');
    const request = pending.get(key) ?? (async () => {
      const response = await fetch(url, { method: kind === 'prediction' ? 'POST' : 'GET',
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(kind === 'prediction' ? { 'Content-Type': 'application/json' } : {}) },
        ...(kind === 'prediction' ? { body: JSON.stringify({ team_1: input.team_1, team_2: input.team_2, played_at: input.played_at }) } : {}),
        redirect: 'follow', signal: AbortSignal.timeout(12000) });
      if (response.status === 404 || response.status === 422) return { unavailable: true };
      if (response.status === 402) throw new Error('Subscription access is unavailable for this feature.');
      if (response.status === 429) throw new Error('The international match feed is busy. Please try again shortly.');
      if (!response.ok) throw new Error('Could not load international match data. Please retry.');
      let value = await response.json();
      if (!value || typeof value !== 'object') throw new Error('Invalid international match response.');
      if (kind === 'prediction') {
        const probability = value.probability;
        if (!Number.isFinite(probability?.team_1) || !Number.isFinite(probability?.team_2)) throw new Error('Match prediction is unavailable.');
        value = { probability: { team_1: probability.team_1, team_2: probability.team_2 },
          eloDiff: Number.isFinite(value.elo_diff) ? value.elo_diff : null };
      }
      if (kind === 'match' || kind === 'tournament-matches') {
        const match = kind === 'match' ? value : value.data?.[0];
        const linked = typeof match?.connections?.tournament === 'string' ? /^\/api\/tournaments\/(\d+)$/.exec(match.connections.tournament) : null;
        const tournamentId = kind === 'tournament-matches' ? resourceId : linked ? Number(linked[1]) : null;
        if (tournamentId) {
          let tournament = tournaments.get(tournamentId);
          if (!tournament || tournament.until <= Date.now()) {
            const detail = await fetch(`https://padelapi.org/api/tournaments/${tournamentId}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, redirect: 'follow', signal: AbortSignal.timeout(12000) });
            if (detail.ok) {
              tournament = { value: await detail.json(), until: Date.now() + 600000 };
              tournaments.set(tournamentId, tournament);
              if (tournaments.size > 100) tournaments.delete(tournaments.keys().next().value!);
            }
          }
          if (tournament) {
            if (kind === 'match') value = { ...value, tournament: tournament.value };
            else value = { ...value, data: value.data.map((row: unknown) => ({ ...(row as object), tournament: tournament!.value })) };
          }
        }
      }
      const ttl = kind === 'live' ? 45000 : ['seasons', 'season-tournaments', 'head-to-head', 'prediction', 'player-stats'].includes(kind) ? 600000 : kind === 'tournament-matches' ? 180000 : kind === 'match' ? 30000 : 45000;
      if (cache.size >= 200) cache.delete(cache.keys().next().value!);
      cache.set(key, { value, until: Date.now() + ttl });
      return value;
    })();
    pending.set(key, request);
    try { return json(await request); } finally { pending.delete(key); }
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'International tour data is unavailable. Please retry.' }, 503);
  }
});
