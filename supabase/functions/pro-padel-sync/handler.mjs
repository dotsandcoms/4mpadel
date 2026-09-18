import { buildSnapshot, buildTourSnapshot, buildFixtureSnapshot, publishSnapshot } from '../_shared/pro-padel.mjs';

const builders = { rankings: buildSnapshot, tour: buildTourSnapshot, fixtures: buildFixtureSnapshot };
const reply = (status, body) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

async function authorized(actual, secret) {
  if (!secret || !actual) return false;
  const hash = async (value) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  const [a, b] = await Promise.all([hash(actual), hash(`Bearer ${secret}`)]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

export async function handleRefresh(request, config, dependencies = {}) {
  if (request.method !== 'POST') return reply(405, { error: 'Method not allowed' });
  if (!await authorized(request.headers.get('authorization'), config.secret)) return reply(401, { error: 'Unauthorized' });
  let scope;
  try { ({ scope } = await request.json()); } catch { return reply(400, { error: 'Invalid request' }); }
  if (!Object.hasOwn(builders, scope)) return reply(400, { error: 'Invalid scope' });
  try {
    const snapshot = await (dependencies.builders || builders)[scope]({ token: config.token });
    await (dependencies.publish || publishSnapshot)(snapshot, {
      url: config.url, serviceKey: config.serviceKey, cachePath: `${scope}-v1.json`,
    });
    return reply(200, { scope, updatedAt: snapshot.updatedAt });
  } catch {
    // Never send provider responses or credentials to clients or logs.
    return reply(502, { error: 'Refresh failed. The previous snapshot is still available.' });
  }
}
