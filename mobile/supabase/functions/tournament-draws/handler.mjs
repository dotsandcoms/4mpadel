const API = 'https://api.rankedin.com/v1/tournament';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
export const classesUrl = id => `${API}/GetClassesAndDrawNamesAsync/?tournamentId=${id}`;
export const drawUrl = (id, stage, strength) => `${API}/GetDrawsForStageAndStrengthAsync?tournamentClassId=${id}&drawStrength=${strength}&drawStage=${stage}&isReadonly=true&language=en`;

export async function sharedDrawCache(client, url, fetchImpl = fetch, now = Date.now()) {
  const cached = await client.from('rankedin_cache').select('payload,updated_at').eq('url', url).maybeSingle();
  if (cached.error) throw new Error('Draw cache unavailable');
  const row = cached.data;
  if (Array.isArray(row?.payload) && now - Date.parse(row.updated_at) < 120000) return { payload: row.payload, updatedAt: row.updated_at, stale: false };
  const claim = await client.rpc('claim_rankedin_draw_refresh', { p_url: url });
  if (claim.error) throw new Error('Draw refresh unavailable');
  if (!claim.data) {
    if (Array.isArray(row?.payload)) return { payload: row.payload, updatedAt: row.updated_at, stale: true };
    throw new Error('Draw is refreshing. Please retry shortly.');
  }
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(10000), headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Draw provider unavailable');
    const payload = await response.json();
    if (!Array.isArray(payload)) throw new Error('Draw provider unavailable');
    // A transient empty response must not erase an already published bracket.
    if (!payload.length && row?.payload?.length) return { payload: row.payload, updatedAt: row.updated_at, stale: true };
    const updatedAt = new Date(now).toISOString();
    const write = await client.from('rankedin_cache').upsert({ url, payload, updated_at: updatedAt }, { onConflict: 'url' });
    if (write.error) throw new Error('Could not save draw refresh');
    return { payload, updatedAt, stale: false };
  } catch (error) {
    if (Array.isArray(row?.payload)) return { payload: row.payload, updatedAt: row.updated_at, stale: true };
    throw error;
  }
}

/** Only known, visible events and published class/stage combinations may reach the provider. */
export async function handleDraws(request, { client, authenticate, fetchImpl = fetch }) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return reply(405, { error: 'Method not allowed' });
  if (!await authenticate(request)) return reply(401, { error: 'Please sign in to view tournament draws.' });
  let body;
  try { body = await request.json(); } catch { return reply(400, { error: 'Invalid draw request' }); }
  if (!Number.isSafeInteger(body.eventId) || body.eventId <= 0) return reply(400, { error: 'Invalid event' });
  try {
    const event = await client.from('calendar').select('rankedin_id,rankedin_url,is_visible,sanction_status').eq('id', body.eventId).maybeSingle();
    if (event.error) throw new Error('Event unavailable');
    const e = event.data;
    if (!e || e.is_visible === false || e.sanction_status && e.sanction_status !== 'approved') return reply(404, { error: 'Event unavailable' });
    const id = /^[1-9]\d*$/.test(String(e.rankedin_id || '').trim()) ? String(e.rankedin_id).trim()
      : e.rankedin_url?.match(/^https?:\/\/(?:www\.)?rankedin\.com\/(?:[a-z-]+\/)?tournament\/([1-9]\d*)(?:[/?#]|$)/i)?.[1];
    if (!id) return reply(404, { error: 'No published draw for this event' });
    const classes = await sharedDrawCache(client, classesUrl(id), fetchImpl);
    if (body.classId == null) return reply(200, classes);
    if (!/^[1-9]\d*$/.test(String(body.classId)) || !Number.isSafeInteger(body.stage) || body.stage < 0 || !Number.isSafeInteger(body.strength) || body.strength < 0) return reply(400, { error: 'Invalid division' });
    const division = classes.payload.find(c => String(c.Id) === String(body.classId) && (c.IsPublished || c.ShowDraws));
    if (!division?.TournamentDraws?.some(d => Number(d.Stage || 0) === body.stage && Number(d.Strength || 0) === body.strength)) return reply(404, { error: 'This division draw has not been published.' });
    return reply(200, await sharedDrawCache(client, drawUrl(body.classId, body.stage, body.strength), fetchImpl));
  } catch { return reply(503, { error: 'Draws could not refresh. Please try again shortly.' }); }
}
