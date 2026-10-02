import { createClient } from 'npm:@supabase/supabase-js@2';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info' };
const cache = new Map<string, { until: number; value: unknown }>();
const attempts = new Map<string, number>();
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const slugForName = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function canonicalFipUrl(input: string): string | null {
  try {
    const value = new URL(input.trim());
    if (value.protocol !== 'https:' || !['www.padelfip.com', 'padelfip.com'].includes(value.hostname) || value.port || value.username || value.password || value.search || value.hash) return null;
    const match = /^\/player\/([a-z0-9-]+)\/?$/i.exec(value.pathname);
    return match ? `https://www.padelfip.com/player/${match[1].toLowerCase()}/` : null;
  } catch { return null; }
}
async function officialFipProfile(url: string): Promise<{ name: string; url: string; rank: number | null; premierBestRank: number | null } | null> {
  try {
    const response = await fetch(url, { headers: { Accept: 'text/html' }, redirect: 'error', signal: AbortSignal.timeout(8000) });
    if (!response.ok || !(response.headers.get('content-type') || '').includes('text/html')) return null;
    const html = (await response.text()).slice(0, 1_000_000);
    const title = /<title[^>]*>([^<]{1,240})<\/title>/i.exec(html)?.[1]?.trim() || '';
    const name = /^(.+?) Official Profile \d{4} \| Padel FIP$/i.exec(title)?.[1]
      ?.replace(/&amp;/g, '&').replace(/&#39;|&#x27;/gi, "'").replace(/&quot;/g, '"').trim();
    const positiveRank = (value: string | undefined) => {
      const parsed = Number(value?.replace(/,/g, ''));
      return value && Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
    };
    const rank = positiveRank(/<span\s+class=["']player__number["'][^>]*>\s*([\d,]+)\s*<\/span>/i.exec(html)?.[1]);
    const premierPanel = /<div[^>]*role=["']tabpanel["'][^>]*data-trim=["']premier-padel["'][^>]*>/i.exec(html);
    const premierHtml = premierPanel ? html.slice(premierPanel.index, premierPanel.index + 3000) : '';
    const premierBestRank = positiveRank(/class=["']tab__row tab__career["'][\s\S]*?class=["']tab__title["']>\s*Best Rank\s*<\/p>\s*<span\s+class=["']tab__value["']>\s*([\d,]+)\s*<\/span>/i.exec(premierHtml)?.[1]);
    return name && name.length <= 160 ? { name, url, rank, premierBestRank } : null;
  } catch { return null; }
}
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('authorization') || '' } } });
    const { data: { user } } = await client.auth.getUser();
    if (!user) return json({ error: 'Sign in to search the FIP player directory.' }, 401);
    const input = await req.json();
    const q = String(input.query || '').trim();
    const page = Number(input.page || 1);
    const category = input.category || 'all';
    const id = input.id == null ? null : Number(input.id);
    const fipUrl = input.fipUrl == null ? null : canonicalFipUrl(String(input.fipUrl));
    if (input.fipUrl != null && !fipUrl) return json({ error: 'Enter a padelfip.com player profile link.' }, 400);
    if (q.length > 80 || !Number.isSafeInteger(page) || page < 1 || page > 10000 || !['all', 'men', 'women'].includes(category) || (id !== null && (!Number.isSafeInteger(id) || id <= 0))) return json({ error: 'Invalid search.' }, 400);
    const key = JSON.stringify([q.toLowerCase(), category, page, id, fipUrl]);
    if ((cache.get(key)?.until || 0) > Date.now()) return json(cache.get(key)!.value);
    if (Date.now() - (attempts.get(user.id) || 0) < 700) return json({ error: 'Please wait a moment before searching again.' }, 429);
    if (attempts.size > 1000) attempts.clear();
    attempts.set(user.id, Date.now());
    if (fipUrl) {
      const officialProfile = await officialFipProfile(fipUrl);
      if (!officialProfile) return json({ error: 'This official FIP profile could not be confirmed. Check the link and try again.' }, 404);
      const value = { officialProfile };
      cache.set(key, { value, until: Date.now() + 600000 });
      return json(value);
    }
    const url = new URL(`https://padelapi.org/api/players${id ? `/${id}` : ''}`);
    if (!id) {
      url.searchParams.set('per_page', '50'); url.searchParams.set('page', String(page));
      url.searchParams.set('sort_by', 'ranking'); url.searchParams.set('order_by', 'asc');
      if (q) url.searchParams.set('name', q);
      if (category !== 'all') url.searchParams.set('category', category);
    }
    const token = Deno.env.get('PADEL_API_TOKEN');
    if (!token) return json({ error: 'FIP player search is temporarily unavailable.' }, 503);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!response.ok) return json({ error: response.status === 429 ? 'FIP player search is busy. Please try again shortly.' : 'FIP player search could not be loaded. Please retry.' }, response.status === 429 ? 429 : 502);
    const raw = await response.json();
    const clean = (v: unknown) => typeof v === 'string' && v !== 'hidden_free_plan' ? v : null;
    const num = (v: unknown) => v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
    const rows = id ? [raw?.data ?? raw] : raw?.data;
    if (!Array.isArray(rows)) return json({ error: 'Invalid FIP player response.' }, 502);
    const players = rows.filter((p: any) => p && Number.isSafeInteger(p.id) && p.id > 0 && clean(p.name) && ['men', 'women'].includes(p.category)).map((p: any) => ({
      id: p.id, name: clean(p.name), category: p.category, rank: num(p.ranking) || 0, points: num(p.points), nationality: clean(p.nationality),
      photoUrl: /^https:\/\//.test(p.photo_url || '') ? p.photo_url : null, height: num(p.height), side: clean(p.side), hand: clean(p.hand), rankingDate: null, rankChange: null, pointsChange: null,
    }));
    let officialProfiles: { name: string; url: string; rank: number | null; premierBestRank: number | null }[] = [];
    if (!id && page === 1 && players.length === 0 && q.split(/\s+/).length >= 2) {
      const slug = slugForName(q);
      if (slug) {
        const profile = await officialFipProfile(`https://www.padelfip.com/player/${slug}/`);
        if (profile && slugForName(profile.name) === slug) officialProfiles = [profile];
      }
    }
    const value = { players, officialProfiles, page, hasMore: !id && Number(raw.meta?.last_page) > page, total: id ? players.length : num(raw.meta?.total), updatedAt: new Date().toISOString() };
    if (cache.size >= 128) cache.delete(cache.keys().next().value!);
    cache.set(key, { value, until: Date.now() + 600000 });
    return json(value);
  } catch { return json({ error: 'Player search is temporarily unavailable. Please retry.' }, 503); }
});
