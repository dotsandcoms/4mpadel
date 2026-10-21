import { fipRefreshSeconds, officialEventUrl, parseFipTournament } from '../_shared/fip-tournament.mjs';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export async function sharedFipTournament(client, event, parseDocument, fetchImpl = fetch, now = Date.now(), cached) {
  const row = cached === undefined ? (await client.from('fip_tournament_cache').select('*').eq('event_id', event.id).maybeSingle()).data : cached;
  if (row?.payload && Date.parse(row.refresh_after) > now) return { ...row.payload, stale: false, pending: false };
  const claim = await client.rpc('claim_fip_tournament_refresh', { p_event_id: event.id });
  if (claim.error) throw new Error('Event cache unavailable');
  const fallback = () => row?.payload ? { ...row.payload, stale: true, pending: false } : { version: 1, event, info: [], documents: [], sections: [], updatedAt: null, stale: true, pending: true };
  if (!claim.data) return fallback();
  try {
    const url = officialEventUrl(event.sourceUrl);
    if (!url) throw new Error('Invalid event source');
    const response = await fetchImpl(url, { headers: { Accept: 'text/html', 'User-Agent': '4M Padel calendar sync/1.0' }, signal: AbortSignal.timeout(12000), redirect: 'error' });
    if (!response.ok) throw new Error('Official source unavailable');
    const payload = parseFipTournament(await response.text(), event, parseDocument, now);
    // Do not erase a published draw because the upstream page temporarily loses its draw markup.
    if (row?.payload?.sections?.length && !payload.sections.length || row?.payload?.documents?.length && !payload.documents.length) throw new Error('Published content temporarily unavailable');
    const saved = await client.from('fip_tournament_cache').update({ payload, refresh_after: new Date(now + fipRefreshSeconds(event, now) * 1000).toISOString(), lease_until: null, last_error: null }).eq('event_id', event.id);
    if (saved.error) throw new Error('Could not cache event');
    return { ...payload, stale: false, pending: false };
  } catch {
    await client.from('fip_tournament_cache').update({ lease_until: new Date(now + 300000).toISOString(), last_error: 'Official source could not refresh' }).eq('event_id', event.id);
    return fallback();
  }
}
export async function handleFipTournament(request, { client, authenticate, resolveEvent, parseDocument, fetchImpl = fetch, now = Date.now() }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return reply(405, { error: 'Method not allowed' });
  if (!await authenticate(request)) return reply(401, { error: 'Please sign in to view this tournament.' });
  let body; try { body = await request.json(); } catch { return reply(400, { error: 'Invalid request' }); }
  if (!Number.isSafeInteger(body.eventId) || body.eventId >= 0 || body.eventId < -2147483647) return reply(400, { error: 'Invalid official event' });
  try {
    const cached = await client.from('fip_tournament_cache').select('*').eq('event_id', body.eventId).maybeSingle();
    if (cached.error) throw new Error('Cache unavailable');
    const event = cached.data?.payload?.event || await resolveEvent(body.eventId);
    if (!event || event.id !== body.eventId || !officialEventUrl(event.sourceUrl)) return reply(404, { error: 'Tournament unavailable' });
    return reply(200, await sharedFipTournament(client, event, parseDocument, fetchImpl, now, cached.data));
  } catch { return reply(503, { error: 'This tournament could not load. Please try again.' }); }
}
