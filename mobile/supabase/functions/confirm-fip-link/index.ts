import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const cleanName = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const positiveInt = (value: unknown) => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;

function officialUrl(input: string): string | null {
  try {
    const url = new URL(input);
    const match = /^\/player\/([a-z0-9-]+)\/?$/i.exec(url.pathname);
    return url.protocol === 'https:' && ['padelfip.com', 'www.padelfip.com'].includes(url.hostname) && !url.port && !url.username && !url.password && !url.search && !url.hash && match
      ? `https://www.padelfip.com/player/${match[1].toLowerCase()}/` : null;
  } catch { return null; }
}

async function officialProfile(url: string) {
  const response = await fetch(url, { headers: { Accept: 'text/html' }, redirect: 'error', signal: AbortSignal.timeout(8000) });
  if (!response.ok || !(response.headers.get('content-type') || '').includes('text/html')) throw new Error('Official FIP profile could not be confirmed.');
  const html = (await response.text()).slice(0, 1_000_000);
  const title = /<title[^>]*>([^<]{1,240})<\/title>/i.exec(html)?.[1]?.trim() || '';
  const name = /^(.+?) Official Profile \d{4} \| Padel FIP$/i.exec(title)?.[1]
    ?.replace(/&amp;/g, '&').replace(/&#39;|&#x27;/gi, "'").replace(/&quot;/g, '"').trim();
  if (!name || name.length > 160) throw new Error('Official FIP profile could not be confirmed.');
  const rank = positiveInt(/<span\s+class=["']player__number["'][^>]*>\s*([\d,]+)\s*<\/span>/i.exec(html)?.[1]?.replace(/,/g, ''));
  return { name, rank };
}

async function padelApiProfile(id: number) {
  const token = Deno.env.get('PADEL_API_TOKEN');
  if (!token) throw new Error('FIP player verification is temporarily unavailable.');
  const response = await fetch(`https://padelapi.org/api/players/${id}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('FIP player could not be confirmed right now.');
  const raw = await response.json();
  const player = raw?.data ?? raw;
  if (positiveInt(player?.id) !== id || typeof player.name !== 'string' || !['men', 'women'].includes(player.category)) throw new Error('FIP player record could not be confirmed.');
  return player;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  try {
    const authorization = req.headers.get('authorization') || '';
    const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } } });
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user?.email) return json({ error: 'Sign in to link your FIP profile.' }, 401);
    const input = await req.json();
    const localPlayerId = positiveInt(input.localPlayerId);
    const requestedId = input.fipPlayerId == null ? null : positiveInt(input.fipPlayerId);
    const requestedUrl = input.fipProfileUrl == null ? null : officialUrl(String(input.fipProfileUrl));
    if (!localPlayerId || (input.fipPlayerId != null && !requestedId) || (input.fipProfileUrl != null && !requestedUrl) || (requestedId && requestedUrl)) return json({ error: 'Choose one valid FIP profile.' }, 400);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: local, error: localError } = await admin.from('players').select('id,name,email,category').eq('id', localPlayerId).maybeSingle();
    if (localError) throw localError;
    if (!local || String(local.email || '').trim().toLowerCase() !== user.email.trim().toLowerCase()) return json({ error: 'This 4M profile is not attached to your account.' }, 403);
    const { data: existing, error: existingError } = await admin.from('player_fip_links').select('fip_player_id,fip_profile_url,fip_category,status').eq('local_player_id', localPlayerId).maybeSingle();
    if (existingError) throw existingError;
    if (existing?.status === 'verified') return json({ verified: true });
    if (existing && (requestedId && existing.fip_player_id !== requestedId || requestedUrl && existing.fip_profile_url !== requestedUrl)) return json({ error: 'Remove the current FIP link before choosing another.' }, 409);
    const fipPlayerId = requestedId ?? existing?.fip_player_id ?? null;
    const fipProfileUrl = requestedUrl ?? existing?.fip_profile_url ?? null;
    if (!fipPlayerId && !fipProfileUrl) return json({ error: 'Choose a FIP profile to link.' }, 400);

    let name: string, category: 'men' | 'women', rank: number | null, points: number | null = null;
    let nationality: string | null = null, photoUrl: string | null = null, hand: string | null = null, side: string | null = null;
    if (fipPlayerId) {
      const provider = await padelApiProfile(fipPlayerId);
      name = provider.name.trim(); category = provider.category; rank = positiveInt(provider.ranking);
      points = provider.points != null && Number.isFinite(Number(provider.points)) ? Math.max(0, Math.round(Number(provider.points))) : null;
      nationality = typeof provider.nationality === 'string' ? provider.nationality : null;
      photoUrl = typeof provider.photo_url === 'string' && /^https:\/\//.test(provider.photo_url) ? provider.photo_url : null;
      hand = typeof provider.hand === 'string' ? provider.hand : null;
      side = typeof provider.side === 'string' ? provider.side : null;
    } else {
      const official = await officialProfile(fipProfileUrl!);
      name = official.name; rank = official.rank;
      category = existing?.fip_category === 'women' || /women|female|ladies/i.test(local.category || '') ? 'women' : 'men';
    }
    if (!name || cleanName(name) !== cleanName(local.name || '')) return json({ error: 'The official FIP name must match your 4M player name before this link can be verified.' }, 422);
    const localGender = /women|female|ladies/i.test(local.category || '') ? 'women' : /men|male/i.test(local.category || '') ? 'men' : null;
    if (localGender && category !== localGender) return json({ error: 'The FIP player category does not match your 4M profile.' }, 422);

    const snapshot = { fip_player_id: fipPlayerId, fip_profile_url: fipProfileUrl, fip_player_name: name, fip_category: category,
      fip_rank: rank, fip_points: points, fip_nationality: nationality, fip_photo_url: photoUrl, fip_hand: hand, fip_side: side,
      status: 'verified', verified_at: new Date().toISOString() };
    const result = existing
      ? await admin.from('player_fip_links').update(snapshot).eq('local_player_id', localPlayerId).eq('status', 'pending').select('local_player_id').single()
      : await admin.from('player_fip_links').insert({ local_player_id: localPlayerId, requested_by: user.id, ...snapshot }).select('local_player_id').single();
    if (result.error) return json({ error: result.error.code === '23505' ? 'This FIP record is already linked to another player.' : 'FIP link could not be saved. Please try again.' }, result.error.code === '23505' ? 409 : 500);
    return json({ verified: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'FIP link could not be verified. Please try again.' }, 503);
  }
});
