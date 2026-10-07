import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info' };
const cache = new Map<string, { until: number; value: unknown }>();
const pending = new Map<string, Promise<unknown>>();
const attempts = new Map<string, number[]>();
const tournaments = new Map<number, { until: number; value: unknown }>();
const playerCountries = new Map<number, { until: number; value: string | null }>();
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const id = (value: unknown) => Number.isSafeInteger(Number(value)) && Number(value) > 0 && Number(value) <= 2147483647;
const pairId = (value: unknown) => typeof value === 'string' && /^([1-9]\d*)-([1-9]\d*)$/.test(value) && value.split('-').every(id);

async function withPlayerCountries(rows: Record<string, any>[], token: string) {
  const players = new Map<number, string>();
  for (const row of rows) for (const team of ['team_1', 'team_2']) {
    for (const player of Array.isArray(row.players?.[team]) ? row.players[team] : []) {
      if (id(player?.id) && typeof player.name === 'string' && player.name.trim()) players.set(Number(player.id), player.name.trim());
    }
  }
  const now = Date.now();
  const missing = [...players].filter(([playerId]) => (playerCountries.get(playerId)?.until || 0) <= now);
  const groups = Array.from({ length: Math.ceil(missing.length / 20) }, (_, index) => missing.slice(index * 20, (index + 1) * 20));
  await Promise.all(groups.map(async group => {
    const url = new URL('https://padelapi.org/api/players');
    url.searchParams.set('name', group.map(([, name]) => name).join(','));
    url.searchParams.set('per_page', '100');
    try {
      const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
      if (!response.ok) return;
      const value = await response.json();
      const found = new Map<number, string>((Array.isArray(value?.data) ? value.data : [])
        .filter((player: any) => id(player?.id) && typeof player.nationality === 'string' && /^[A-Z]{2}$/.test(player.nationality))
        .map((player: any) => [Number(player.id), player.nationality]));
      for (const [playerId] of group) playerCountries.set(playerId, { value: found.get(playerId) || null, until: now + 1800000 });
    } catch { /* Match results remain available when a country lookup fails. */ }
  }));
  if (playerCountries.size > 4000) playerCountries.clear();
  return rows.map(row => ({ ...row, players: row.players ? Object.fromEntries(['team_1', 'team_2'].map(team => [team,
    Array.isArray(row.players[team]) ? row.players[team].map((player: any) => ({ ...player, nationality: playerCountries.get(Number(player?.id))?.value || player.nationality || null })) : []])) : row.players }));
}

const plainText = (html: string) => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#39;|&#x27;/gi, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

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
    const isPair = ['pair-stats', 'pair-matches'].includes(kind);
    if (!['live', 'match', 'stats', 'points', 'head-to-head', 'prediction', 'player', 'player-coach', 'player-stats', 'player-matches', 'player-pairs', 'player-rankings', 'pair-stats', 'pair-matches', 'tournament', 'tournament-matches', 'seasons', 'season-tournaments'].includes(kind) ||
      (!['live', 'seasons'].includes(kind) && !(isPair ? pairId(input?.id) : id(input?.id))) || !Number.isSafeInteger(page) || page < 1 || page > 20) return json({ error: 'Invalid request.' }, 400);
    const year = input?.year == null ? null : Number(input.year);
    if (['player-matches', 'pair-matches'].includes(kind) && year !== null && (!Number.isSafeInteger(year) || year < 2006 || year > new Date().getUTCFullYear() + 1)) return json({ error: 'Invalid year.' }, 400);
    if (kind === 'prediction' && (!Array.isArray(input.team_1) || !Array.isArray(input.team_2) ||
      input.team_1.length !== 2 || input.team_2.length !== 2 ||
      ![...input.team_1, ...input.team_2].every(id) || new Set([...input.team_1, ...input.team_2]).size !== 4 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.played_at || ''))) return json({ error: 'Invalid prediction request.' }, 400);
    const numericResourceId = Number(input?.id);
    const resourceId = isPair ? String(input.id) : numericResourceId;
    const key = `${kind}:${['live', 'seasons'].includes(kind) ? '' : resourceId}:${['tournament-matches', 'season-tournaments', 'player-matches', 'pair-matches', 'player-pairs'].includes(kind) ? `${page}:${['player-matches', 'pair-matches'].includes(kind) ? year ?? 'all' : ''}` : kind === 'prediction' ? [...input.team_1, ...input.team_2, input.played_at].join(':') : ''}`;
    const cached = cache.get(key);
    if (cached && cached.until > Date.now()) return json(cached.value);
    // Allow a live-list burst and match detail tabs, but stop rapid manual reload loops.
    const recent = (attempts.get(user.id) || []).filter(time => Date.now() - time < 10000);
    if (recent.length >= 15) return json({ error: 'Please wait a moment before refreshing.' }, 429);
    attempts.set(user.id, [...recent, Date.now()]);
    if (attempts.size > 2000) attempts.clear();
    const token = Deno.env.get('PADEL_API_TOKEN');
    if (!token) return json({ error: 'International tour details are temporarily unavailable.' }, 503);
    if (kind === 'player-coach') {
      const playerKey = `player:${resourceId}:`;
      let player = cache.get(playerKey)?.value as { name?: string } | undefined;
      if (!player?.name) {
        const response = await fetch(`https://padelapi.org/api/players/${resourceId}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
        if (!response.ok) return json({ coaches: [], sourceUrl: null });
        player = await response.json();
      }
      const name = typeof player?.name === 'string' ? player.name : '';
      const slug = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if (!slug) return json({ coaches: [], sourceUrl: null });
      const sourceUrl = `https://www.padelfip.com/player/${slug}/`;
      try {
        const response = await fetch(sourceUrl, { headers: { 'User-Agent': '4M Padel/1.0' }, signal: AbortSignal.timeout(10000) });
        if (!response.ok || new URL(response.url).hostname !== 'www.padelfip.com') return json({ coaches: [], sourceUrl: null });
        const html = await response.text();
        const title = plainText(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const comparedName = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        if (!title.includes(comparedName)) return json({ coaches: [], sourceUrl: null });
        const section = html.match(/<span class="overview__title">Coaches<\/span>\s*<div class="overview__coaches">([\s\S]*?)<\/div>/i)?.[1] || '';
        const coaches = [...section.matchAll(/<p class="overview__text">([\s\S]*?)<\/p>/gi)].map(match => plainText(match[1])).filter(value => value && value !== '--').slice(0, 4);
        const result = { coaches, sourceUrl };
        cache.set(key, { value: result, until: Date.now() + 3600000 });
        return json(result);
      } catch { return json({ coaches: [], sourceUrl: null }); }
    }
    let path = '';
    if (kind === 'live') path = 'live';
    if (kind === 'match') path = `matches/${resourceId}`;
    if (kind === 'stats') path = `matches/${resourceId}/stats`;
    if (kind === 'points') path = `matches/${resourceId}/live`;
    if (kind === 'head-to-head') path = `matches/${resourceId}/headtohead`;
    if (kind === 'player') path = `players/${resourceId}`;
    if (kind === 'player-stats') path = `players/${resourceId}/stats`;
    if (kind === 'player-matches') path = `players/${resourceId}/matches`;
    if (kind === 'player-pairs') path = `players/${resourceId}/pairs`;
    if (kind === 'player-rankings') path = `players/${resourceId}/rankings`;
    if (kind === 'pair-stats') path = `pairs/${resourceId}/stats`;
    if (kind === 'pair-matches') path = `pairs/${resourceId}/matches`;
    if (kind === 'prediction') path = 'matches/simulate';
    if (kind === 'tournament') path = `tournaments/${resourceId}`;
    if (kind === 'tournament-matches') path = `tournaments/${resourceId}/matches`;
    if (kind === 'seasons') path = 'seasons';
    if (kind === 'season-tournaments') path = `seasons/${resourceId}/tournaments`;
    const url = new URL(`https://padelapi.org/api/${path}`);
    if (kind === 'tournament-matches') { url.searchParams.set('page', String(page)); url.searchParams.set('per_page', '50'); url.searchParams.set('draw', 'all'); }
    if (kind === 'player-matches' || kind === 'pair-matches') {
      url.searchParams.set('page', String(page)); url.searchParams.set('per_page', '20'); url.searchParams.set('draw', 'all');
      if (kind === 'player-matches') { url.searchParams.set('sort_by', 'played_at'); url.searchParams.set('order_by', 'desc'); }
      if (year !== null) { url.searchParams.set('after_date', `${year}-01-01`); url.searchParams.set('before_date', `${year}-12-31`); }
    }
    if (kind === 'player-pairs') url.searchParams.set('page', String(page));
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
        const tournamentId = kind === 'tournament-matches' ? numericResourceId : linked ? Number(linked[1]) : null;
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
      if ((kind === 'player-matches' || kind === 'pair-matches') && Array.isArray(value.data)) {
        const withCountries = withPlayerCountries(value.data, token);
        const tournamentId = (row: any) => {
          const linked = typeof row?.connections?.tournament === 'string' ? /^\/api\/tournaments\/(\d+)$/.exec(row.connections.tournament) : null;
          return linked ? Number(linked[1]) : null;
        };
        const ids = [...new Set<number>((value.data as unknown[]).map(tournamentId).filter((linked): linked is number => typeof linked === 'number' && linked > 0))].slice(0, 8);
        await Promise.all(ids.map(async tournamentId => {
          if ((tournaments.get(tournamentId)?.until || 0) > Date.now()) return;
          try {
            const detail = await fetch(`https://padelapi.org/api/tournaments/${tournamentId}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, redirect: 'follow', signal: AbortSignal.timeout(8000) });
            if (!detail.ok) return;
            const tournament = await detail.json();
            if (tournament?.id !== tournamentId || typeof tournament.name !== 'string') return;
            tournaments.set(tournamentId, { value: tournament, until: Date.now() + 600000 });
            if (tournaments.size > 100) tournaments.delete(tournaments.keys().next().value!);
          } catch { /* A missing event name must not hide the match result. */ }
        }));
        value = { ...value, data: (await withCountries).map((row: any) => {
          const linked = tournamentId(row);
          const tournament = linked ? tournaments.get(linked) : null;
          return tournament && tournament.until > Date.now() ? { ...row, tournament: tournament.value } : row;
        }) };
      }
      if (kind === 'match') value = (await withPlayerCountries([value], token))[0];
      if (kind === 'tournament-matches' && Array.isArray(value.data)) value = { ...value, data: await withPlayerCountries(value.data, token) };
      const ttl = ['live', 'tournament-matches'].includes(kind) ? 45000 : ['tournament', 'seasons', 'season-tournaments', 'head-to-head', 'prediction', 'player', 'player-stats', 'player-pairs', 'player-rankings', 'pair-stats'].includes(kind) ? 600000 : ['player-matches', 'pair-matches'].includes(kind) ? 180000 : kind === 'match' ? 30000 : 45000;
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
