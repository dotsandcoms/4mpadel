/** Shared by mobile, web and cron. Provider credentials never enter cache keys. */
export function padelCacheSeconds(url, payload) {
  if (payload && ['finished', 'retired', 'walkover'].includes(payload.status)) return 604800;
  if (url.pathname === '/api/live' || /\/matches\/\d+\/live$/.test(url.pathname)) return 120;
  if (/\/matches\/\d+$/.test(url.pathname)) return 300;
  if (/\/tournaments\/\d+\/matches$/.test(url.pathname)) return 600;
  if (/\/players\/\d+\/matches$|\/pairs\/[^/]+\/matches$/.test(url.pathname)) return 21600;
  if (/\/players(?:\/|$)/.test(url.pathname)) return 86400;
  if (url.pathname === '/api/tournaments' || url.pathname === '/api/seasons') return 21600;
  return 3600;
}
export function retryAfterDate(response, now = Date.now()) {
  const header = response.headers.get('retry-after');
  const seconds = header && /^\d+$/.test(header.trim()) ? Number(header) : null;
  const date = seconds == null && header ? Date.parse(header) : NaN;
  const until = seconds != null ? now + seconds * 1000 : Number.isFinite(date) ? date : now + 60000;
  return new Date(Math.min(now + 32 * 86400000, Math.max(now + 1000, until))).toISOString();
}
export async function padelRetryAt(client) {
  const { data, error } = await client.rpc('padel_api_retry_at');
  if (error) throw new Error('International feed status could not be checked. Please retry.');
  return typeof data === 'string' && Date.parse(data) > Date.now() ? data : null;
}
export function rateLimitMessage(until) {
  const date = new Intl.DateTimeFormat('en-ZA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Africa/Johannesburg' }).format(new Date(until));
  return `Showing saved international data. The next refresh can be attempted after ${date} SAST.`;
}
export function canonicalPadelUrl(input) {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (url.pathname === '/api/live' && !url.searchParams.has('page')) url.searchParams.set('page', '1');
  if (url.pathname === '/api/players' && url.searchParams.has('name')) url.searchParams.set('name', url.searchParams.get('name').split(',').map(v => v.trim()).filter(Boolean).sort().join(','));
  url.searchParams.sort(); url.hash = '';
  return url;
}
function savedResponse(state) {
  return Response.json(state.payload, { headers: {
    'x-4m-fetched-at': state.fetched_at || '', 'x-4m-cache': state.action === 'stale' ? 'stale' : 'fresh',
    ...(state.reason ? { 'x-4m-cache-reason': state.reason } : {}), ...(state.retry_at ? { 'x-4m-retry-at': state.retry_at } : {}),
  } });
}
async function checked(client, name, args) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error('The shared international cache is temporarily unavailable.');
  return data;
}
export function createPadelFetch(client, fetcher = fetch, options = {}) {
  const sleep = options.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  return async (input, init) => {
    const url = canonicalPadelUrl(input);
    if (url.hostname !== 'padelapi.org') return fetcher(input, init);
    if (url.protocol !== 'https:' || !url.pathname.startsWith('/api/')) throw new Error('Invalid provider resource.');
    let key = url.href;
    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (method !== 'GET') {
      const body = typeof init?.body === 'string' ? init.body : input instanceof Request ? await input.clone().text() : '';
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body)));
      key += `#${method}:${Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')}`;
    }
    let state;
    for (let attempt = 0; attempt < 30; attempt++) {
      state = await checked(client, 'claim_padel_request', { p_key: key });
      if (state?.action !== 'wait') break;
      await sleep(200 + Math.floor(Math.random() * 150));
    }
    if (['cached', 'stale'].includes(state?.action)) return savedResponse(state);
    if (state?.action !== 'fetch') throw new Error(state?.retry_at ? rateLimitMessage(state.retry_at) : 'International details are refreshing. Please try again shortly.');
    let response, limit = null, remaining = null;
    try {
      response = await fetcher(input, init);
      limit = Number(response.headers.get('x-ratelimit-limit')) || null;
      remaining = response.headers.has('x-ratelimit-remaining') ? Number(response.headers.get('x-ratelimit-remaining')) : null;
      if (response.status === 429 || remaining != null && remaining <= 5) await checked(client, 'pause_padel_api', { p_until: retryAfterDate(response) });
      if (response.ok) {
        const payload = await response.clone().json();
        await checked(client, 'save_padel_response', { p_key: key, p_payload: payload, p_seconds: padelCacheSeconds(url, payload) });
        const stamp = new Date().toISOString();
        const originalStatus = response.status;
        response = Response.json(payload, { headers: { 'x-4m-fetched-at': stamp, 'x-4m-cache': 'fresh' } });
        await checked(client, 'finish_padel_request', { p_key: key, p_lease: state.lease_id, p_request: state.request_id, p_status: originalStatus, p_limit: limit, p_remaining: remaining });
      } else {
        if (response.status === 429 || response.status >= 500) throw new Error('International data refresh is temporarily paused.');
        await checked(client, 'finish_padel_request', { p_key: key, p_lease: state.lease_id, p_request: state.request_id, p_status: response.status, p_limit: limit, p_remaining: remaining });
      }
      return response;
    } catch (error) {
      await client.rpc('finish_padel_request', { p_key: key, p_lease: state.lease_id, p_request: state.request_id, p_status: response?.status || 0, p_limit: limit, p_remaining: remaining });
      const previous = await checked(client, 'stale_padel_response', { p_key: key });
      if (previous?.payload) return savedResponse({ ...previous, action: 'stale', reason: 'refresh_failed' });
      throw error;
    }
  };
}
