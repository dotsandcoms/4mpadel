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
export type ExpoPush = (endpoint: string, body: unknown) => Promise<{ status?: string; details?: { error?: string } }>;

const env = (key: string) => Deno.env.get(key);

export function credentialsAvailable(platform: Platform) {
  return platform === 'android'
    || !!(env('LIVE_SCORE_APNS_KEY') && env('LIVE_SCORE_APNS_KEY_ID') && env('LIVE_SCORE_APNS_TEAM_ID'));
}

const bytesToBase64 = (value: Uint8Array) => btoa(String.fromCharCode(...value)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
const encode = (value: unknown) => bytesToBase64(new TextEncoder().encode(JSON.stringify(value)));
const readKey = (key: string) => Uint8Array.from(atob(key.replaceAll('\\n', '\n').replace(/-----[^-]+-----|\s/g, '')), ch => ch.charCodeAt(0));

async function signAppleToken() {
  const key = await crypto.subtle.importKey('pkcs8', readKey(env('LIVE_SCORE_APNS_KEY')!),
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const header = encode({ alg: 'ES256', kid: env('LIVE_SCORE_APNS_KEY_ID') });
  const claims = encode({ iss: env('LIVE_SCORE_APNS_TEAM_ID'), iat: Math.floor(Date.now() / 1000) });
  const data = new TextEncoder().encode(header + '.' + claims);
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, data);
  return header + '.' + claims + '.' + bytesToBase64(new Uint8Array(signature));
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

const appleToken = cachedCredential(signAppleToken);

export function applePayload(score: Score, teams: ScorePin['teams'], now: number) {
  const final = score.status === 'final';
  return { aps: {
    timestamp: now, event: final ? 'end' : 'update',
    ...(final ? { 'dismissal-date': now + 300 } : { 'stale-date': score.freshUntil }),
    'content-state': { ...score, teams },
  } };
}

export async function sendLiveScore(pin: ScorePin, score: Score, expo: ExpoPush): Promise<Outcome> {
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

  // Use the same Expo-managed FCM credentials as the app’s existing Android notifications.
  const ticket = await expo('send', {
    to: pin.token, priority: 'high', ttl: 180, _contentAvailable: true,
    data: { type: 'pro_live_score', pin: pin.pin, match: pin.match, score: { ...score, teams: pin.teams } },
  });
  if (ticket.status === 'ok') return 'accepted';
  return ticket.details?.error === 'DeviceNotRegistered' ? 'invalid' : 'retry';
}
