import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('profile creation preserves the URL token, not the token-free lookup response', () => {
  const source = readFileSync(new URL('../../src/pages/ClaimClubInvite.jsx', import.meta.url), 'utf8');
  assert.match(source, /const token = searchParams\.get\('token'\)/);
  assert.match(source, /claim_token=\$\{encodeURIComponent\(token\)\}/);
  assert.doesNotMatch(source, /claim_token=\$\{invite\??\.token\}/);
});
