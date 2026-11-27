type Platform = 'ios' | 'android';
export type Score = {
  status: 'live' | 'final'; games: [number, number] | null; sets: [number, number][];
  timestamp: number; freshUntil: number;
};
export type ScorePin = {
  pin: string; match: number; platform: Platform; token: string; teams: [string, string]; lease: string;
  lastScore: Score | null; lastSentAt: string | null;
};
type Outcome = 'accepted' | 'invalid' | 'retry';
type ServiceAccount = { project_id: string; client_email: string; private_key: string };

const env = (key: string) => Deno.env.get(key);
const fcmScope = 'https://www.googleapis.com/auth/firebase.messaging';
const oauthUrl = 'https://oauth2.googleapis.com/token';

export function credentialsAvailable(platform: Platform) {
  return platform === 'ios'
    ? !!(env('LIVE_SCORE_APNS_KEY') && env('LIVE_SCORE_APNS_KEY_ID') && env('LIVE_SCORE_APNS_TEAM_ID'))
    : !!env('LIVE_SCORE_FCM_SERVICE_ACCOUNT');
}

const bytesToBase64 = (value: Uint8Array) => btoa(String.fromCharCode(...value)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
const encode = (value: unknown) => bytesToBase64(new TextEncoder().encode(JSON.stringify(value)));
const readKey = (key: string) => Uint8Array.from(atob(key.replaceAll('\\n', '\n').replace(/-----[^-]+-----|\s/g, '')), ch => ch.charCodeAt(0));

async function sign(header: object, claims: object, pem: string, type: 'ES256' | 'RS256') {
  const algorithm = type === 'ES256' ? { name: 'ECDSA', namedCurve: 'P-256' } : { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
  const key = await crypto.subtle.importKey('pkcs8', readKey(pem), algorithm, false, ['sign']);
  const payload = `${encode(header)}.${encode(claims)}`;
  const signature = await crypto.subtle.sign(type === 'ES256' ? { name: 'ECDSA', hash: 'SHA-256' } : algorithm,
    key, new TextEncoder().encode(payload));
  return `${payload}.${bytesToBase64(new Uint8Array(signature))}`;
}

function cachedCredential<T>(load: () => Promise<T>) {
  let cached: { promise: Promise<T>; validUntil: number } | undefined;
  return () => {
    if (cached && cached.validUntil > Date.now()) return cached.promise;
    const promise = load().catch(error => {
      if (cached?.promise === promise) cached = undefined;
      throw error;
    });
    cached = { promise, validUntil: Date.now() + 45 * 60_000 };
    return promise;
  };
}

const appleToken = cachedCredential(() => sign({ alg: 'ES256', kid: env('LIVE_SCORE_APNS_KEY_ID') },
  { iss: env('LIVE_SCORE_APNS_TEAM_ID'), iat: Math.floor(Date.now() / 1000) }, env('LIVE_SCORE_APNS_KEY')!, 'ES256'));

const googleToken = cachedCredential(async () => {
  const account = JSON.parse(env('LIVE_SCORE_FCM_SERVICE_ACCOUNT')!) as ServiceAccount;
  const now = Math.floor(Date.now() / 1000);
  const assertion = await sign({ alg: 'RS256', typ: 'JWT' }, {
    iss: account.client_email, aud: oauthUrl, scope: fcmScope, iat: now, exp: now + 3600,
  }, account.private_key, 'RS256');
  const response = await fetch(oauthUrl, {
    method: 'POST', body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    signal: AbortSignal.timeout(6000),
  });
  const result = await response.json();
  if (!response.ok || typeof result.access_token !== 'string') throw new Error('Live score authorization unavailable');
  return { accessToken: result.access_token, project: account.project_id };
});

export function applePayload(score: Score, teams: ScorePin['teams'], now: number) {
  const final = score.status === 'final';
  return { aps: {
    timestamp: now, event: final ? 'end' : 'update',
    ...(final ? { 'dismissal-date': now + 300 } : { 'stale-date': score.freshUntil }),
    'content-state': { ...score, teams },
  } };
}

export async function sendLiveScore(pin: ScorePin, score: Score): Promise<Outcome> {
  const now = Math.floor(Date.now() / 1000);
  if (pin.platform === 'ios') {
    const host = env('LIVE_SCORE_APNS_ENVIRONMENT') === 'development' ? 'api.sandbox.push.apple.com' : 'api.push.apple.com';
    const response = await fetch(`https://${host}/3/device/${encodeURIComponent(pin.token)}`, {
      method: 'POST',
      headers: {
        Authorization: `bearer ${await appleToken()}`, 'Content-Type': 'application/json',
        'apns-topic': 'com.fourmpadel.app.push-type.liveactivity', 'apns-push-type': 'liveactivity',
        'apns-priority': score.status === 'final' ? '10' : '5', 'apns-expiration': String(now + 180),
      },
      body: JSON.stringify(applePayload(score, pin.teams, now)), signal: AbortSignal.timeout(7000),
    });
    if (response.ok) return 'accepted';
    const failure = await response.json().catch(() => null);
    return response.status === 410 || ['BadDeviceToken', 'DeviceTokenNotForTopic'].includes(failure?.reason) ? 'invalid' : 'retry';
  }

  const { accessToken, project } = await googleToken();
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(project)}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: {
      token: pin.token,
      // This is a user-visible, explicitly pinned score. The native service updates one card in place.
      android: { priority: 'HIGH', ttl: '180s' },
      data: { type: 'pro_live_score', pin: pin.pin, match: String(pin.match), score: JSON.stringify({ ...score, teams: pin.teams }) },
    } }),
    signal: AbortSignal.timeout(7000),
  });
  if (response.ok) return 'accepted';
  const failure = await response.json().catch(() => null);
  return failure?.error?.details?.some((detail: { errorCode?: string }) => detail.errorCode === 'UNREGISTERED') ? 'invalid' : 'retry';
}
