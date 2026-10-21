import { createPadelFetch } from '../_shared/padel-api.mjs';

const json = (body, status) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
async function sameSecret(actual, expected) {
  if (!actual || !expected) return false;
  const digest = async value => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  const [a, b] = await Promise.all([digest(actual), digest(expected)]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}
export function validateProviderRequest(input) {
  if (typeof input?.url !== 'string' || input.url.length > 4000) throw new Error('Invalid resource');
  const url = new URL(input.url);
  if (url.origin !== 'https://padelapi.org' || url.username || url.password || url.hash) throw new Error('Invalid resource');
  const method = input.method || 'GET';
  const getPath = /^\/api\/(?:live|rankings|players(?:\/[1-9]\d*(?:\/(?:stats|matches|pairs|rankings))?)?|seasons(?:\/[1-9]\d*\/tournaments)?|tournaments(?:\/[1-9]\d*(?:\/matches)?)?|matches\/[1-9]\d*(?:\/(?:live|stats|headtohead))?|pairs\/[1-9]\d*-[1-9]\d*\/(?:stats|matches))$/;
  if (method === 'GET' ? !getPath.test(url.pathname) : method !== 'POST' || !/^\/api\/matches\/(?:headtohead|simulate)$/.test(url.pathname)) throw new Error('Invalid resource');
  if ([...url.searchParams].some(([key, value]) => !/^[a-z_]+$/.test(key) || value.length > 500)) throw new Error('Invalid filters');
  for (const [key, maximum] of [['page', 10000], ['per_page', 50]]) {
    if (url.searchParams.has(key) && (!/^\d+$/.test(url.searchParams.get(key)) || Number(url.searchParams.get(key)) < 1 || Number(url.searchParams.get(key)) > maximum)) throw new Error('Invalid pagination');
  }
  if (method === 'GET' && input.body != null) throw new Error('Invalid body');
  if (method === 'POST') {
    const body = JSON.parse(input.body);
    if (!['team_1', 'team_2'].every(key => Array.isArray(body[key]) && body[key].length >= 1 && body[key].length <= 2 && body[key].every(id => Number.isSafeInteger(id) && id > 0 && id <= 2147483647))) throw new Error('Invalid teams');
  }
  return { url, method, body: input.body };
}
// Only the web server holds this credential. Browsers never call this gateway.
export async function handleProvider(request, { secret, client, fetcher = fetch }) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  if (!await sameSecret(request.headers.get('authorization'), secret ? `Bearer ${secret.trim()}` : null)) return json({ error: 'Unauthorized.' }, 401);
  let resource;
  try {
    const body = await request.text();
    if (body.length > 16384) return json({ error: 'Request too large.' }, 413);
    resource = validateProviderRequest(JSON.parse(body));
  } catch { return json({ error: 'Invalid provider resource.' }, 400); }
  try {
    return await createPadelFetch(client, fetcher)(resource.url, {
      method: resource.method, ...(resource.body ? { body: resource.body } : {}),
      headers: { Authorization: `Bearer ${secret.trim()}`, Accept: 'application/json', ...(resource.body ? { 'Content-Type': 'application/json' } : {}) },
      redirect: 'manual', signal: AbortSignal.timeout(10000),
    });
  } catch { return json({ error: 'International details are temporarily unavailable. Saved data will remain available.' }, 503); }
}
