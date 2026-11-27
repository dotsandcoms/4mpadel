import { createClient } from 'npm:@supabase/supabase-js@2';
import { createPadelFetch } from '../_shared/padel-api.mjs';
import { getMatchTeams, getScore } from '../_shared/pro-live-score.mjs';
import { credentialsAvailable } from '../_shared/pro-live-score-push.ts';

const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
const providerFetch = createPadelFetch(client);
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const stopPattern = /^[a-f0-9]{64}$/;
const reply = (error: string, status: number) => Response.json({ error }, { status });

async function command(action: string, data: Record<string, unknown>) {
  const result = await client.rpc('pro_live_score_admin', { p_action: action, p_data: data });
  if (result.error) throw new Error('Live score storage unavailable');
  return result.data === true;
}

async function hashStop(key: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async request => {
  if (request.method !== 'POST') return reply('Method not allowed.', 405);
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object' || typeof body.pin !== 'string' || !uuid.test(body.pin)) {
      return reply('Invalid live score request.', 400);
    }

    if (body.action === 'revoke') {
      if (typeof body.stopKey !== 'string' || !stopPattern.test(body.stopKey)) return reply('Invalid live score request.', 400);
      await command('revoke', { pin: body.pin, stopHash: await hashStop(body.stopKey) });
      return Response.json({ ok: true });
    }

    const auth = request.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ')) return reply('Sign in to pin a live score.', 401);
    const { data, error } = await client.auth.getUser(auth.slice(7));
    if (error || !data.user || data.user.is_anonymous) return reply('Sign in to pin a live score.', 401);
    if (typeof body.installation !== 'string' || !uuid.test(body.installation)) return reply('Invalid device.', 400);
    const identity = { pin: body.pin, installation: body.installation, owner: data.user.id };

    if (body.action === 'stop') {
      await command('stop', identity);
      return Response.json({ ok: true });
    }
    if (body.action === 'token') {
      if (typeof body.token !== 'string' || !/^[a-z0-9:_-]{20,4096}$/i.test(body.token)) return reply('Invalid push token.', 400);
      const active = await command('token', { ...identity, token: body.token });
      return Response.json({ active });
    }

    if (body.action !== 'start' || !Number.isSafeInteger(body.match) || body.match <= 0 || body.match > 2147483647
      || !['ios', 'android'].includes(body.platform) || typeof body.stopKey !== 'string' || !stopPattern.test(body.stopKey)) {
      return reply('Invalid live score request.', 400);
    }
    const token = Deno.env.get('PADEL_API_TOKEN');
    if (!token || !credentialsAvailable(body.platform)) return reply('Pinned scores are temporarily unavailable.', 503);
    const [score, teams] = await Promise.all([
      getScore(providerFetch, token, body.match), getMatchTeams(providerFetch, token, body.match),
    ]);
    if (!score || score.status !== 'live' || !teams) return reply('This match does not have a live score to pin.', 409);
    if (!await command('start', {
      ...identity, match: body.match, platform: body.platform, teams, stopHash: await hashStop(body.stopKey),
    })) return reply('This device already has a score on another account.', 409);
    return Response.json({ score: { ...score, teams } });
  } catch {
    return reply('Pinned scores are temporarily unavailable.', 503);
  }
});
