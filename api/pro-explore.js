/* global process */
import { createSharedProviderFetch } from '../server/padel-api.mjs';
import { exploreRequest, fetchExplore } from '../server/pro-explore.mjs';
export function createExploreHandler({ token = () => process.env.PADEL_API_TOKEN, fetchImpl = null, now = Date.now, providerEnv = process.env } = {}) {
  const cache = new Map();
  const pending = new Map();
  return async function handler(req, res) {
    res.setHeader('Cache-Control','no-store');
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
    let request;
    try { request = exploreRequest(req.query || {}); } catch { return res.status(400).json({ error: 'Invalid Pro Padel request.' }); }
    try {
      const credential = token();
      const providerFetch = fetchImpl || createSharedProviderFetch(undefined, providerEnv);
      const freshness = { stale: false, updatedAt: null };
      const applyFreshness = entry => {
        if (entry.stale) freshness.stale = true;
        if (entry.updatedAt && (!freshness.updatedAt || entry.updatedAt < freshness.updatedAt)) freshness.updatedAt = entry.updatedAt;
        return entry.value;
      };
      const read = async (url, body) => {
        const key = `${url}:${body ? JSON.stringify(body) : ''}`;
        const hit = cache.get(key);
        if (hit && hit.until > now()) return applyFreshness(hit);
        let promise = pending.get(key);
        if (!promise) {
          promise = (async () => {
            const response = await providerFetch(url,{ method: body ? 'POST' : 'GET', ...(body ? { body: JSON.stringify(body) } : {}), headers: { Authorization: `Bearer ${credential}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) }, redirect: 'manual', signal: AbortSignal.timeout(15000) });
            if (!response.ok && response.status !== 404) throw new Error('provider');
            const entry = { value: response.status === 404 ? null : await response.json(), stale: response.headers.get('x-4m-cache') === 'stale', updatedAt: response.headers.get('x-4m-fetched-at') };
            if (cache.size >= 500) cache.delete(cache.keys().next().value);
            cache.set(key,{...entry,until: now()+(entry.stale ? 15000 : request.kind === 'current-tour' ? 120000 : 300000)});
            return entry;
          })();
          pending.set(key,promise);
        }
        try { return applyFreshness(await promise); } finally { if (pending.get(key) === promise) pending.delete(key); }
      };
      const value = await fetchExplore(request,{token:credential,read});
      res.setHeader('Cache-Control', freshness.stale ? 'public, s-maxage=15, stale-while-revalidate=60' : request.kind === 'current-tour' ? 'public, s-maxage=120, stale-while-revalidate=120' : 'public, s-maxage=300, stale-while-revalidate=600');
      return res.status(200).json({ ...value, _freshness: freshness });
    } catch {
      return res.status(503).json({ error: 'Pro Padel details are temporarily unavailable. Please retry shortly.' });
    }
  };
}
export default createExploreHandler();
