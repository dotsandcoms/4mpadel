const base64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const encode = value => base64url(new TextEncoder().encode(JSON.stringify(value)));

export async function revokeAppleAuthorization(code, expectedSubject, env, send = fetch) {
  const clientId = env('APPLE_CLIENT_ID') || 'com.fourmpadel.app';
  let secret = env('APPLE_CLIENT_SECRET');
  if (!secret) {
    const pem = env('APPLE_PRIVATE_KEY')?.replace(/\\n/g, '\n');
    const team = env('APPLE_TEAM_ID'), kid = env('APPLE_KEY_ID');
    if (!pem || !team || !kid) throw new Error('APPLE_REVOCATION_NOT_CONFIGURED');
    const keyBytes = Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s/g, '')), c => c.charCodeAt(0));
    const key = await crypto.subtle.importKey('pkcs8', keyBytes, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${encode({ alg: 'ES256', kid })}.${encode({ iss: team, iat: now, exp: now + 300, aud: 'https://appleid.apple.com', sub: clientId })}`;
    const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(unsigned));
    secret = `${unsigned}.${base64url(signature)}`;
  }
  if (!expectedSubject) throw new Error('APPLE_IDENTITY_MISSING');
  const exchange = await send('https://appleid.apple.com/auth/token', {
    method: 'POST', signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: secret, code, grant_type: 'authorization_code' }),
  });
  if (!exchange.ok) throw new Error('APPLE_TOKEN_EXCHANGE_FAILED');
  const token = await exchange.json();
  const payload = token.id_token?.split('.')[1];
  if (!payload) throw new Error('APPLE_IDENTITY_MISSING');
  const identity = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  if (identity.sub !== expectedSubject || identity.iss !== 'https://appleid.apple.com' || identity.aud !== clientId ||
      (!token.refresh_token && !token.access_token)) throw new Error('APPLE_IDENTITY_MISMATCH');
  const revoked = await send('https://appleid.apple.com/auth/revoke', {
    method: 'POST', signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: secret,
      token: token.refresh_token || token.access_token, token_type_hint: token.refresh_token ? 'refresh_token' : 'access_token' }),
  });
  if (!revoked.ok) throw new Error('APPLE_REVOCATION_FAILED');
}
