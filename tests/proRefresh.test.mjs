import test from 'node:test';
import assert from 'node:assert/strict';
import { handleRefresh } from '../supabase/functions/pro-padel-sync/handler.mjs';

const config = { secret: 'test-secret', token: 'private-token', url: 'https://example.test', serviceKey: 'private-key' };
const request = (body, auth = 'Bearer test-secret') => new Request('https://example.test', {
  method: 'POST', headers: { authorization: auth }, body: JSON.stringify(body),
});

test('refresh rejects unauthorized calls and invalid scopes before provider work', async () => {
  const dependencies = { builders: { rankings: () => assert.fail('must not call provider') } };
  assert.equal((await handleRefresh(request({ scope: 'rankings' }, 'Bearer wrong'), config, dependencies)).status, 401);
  assert.equal((await handleRefresh(request({ scope: 'rankings' }), { ...config, secret: '' }, dependencies)).status, 401);
  assert.equal((await handleRefresh(request({ scope: '__proto__' }), config, dependencies)).status, 400);
  assert.equal((await handleRefresh(new Request('https://example.test'), config, dependencies)).status, 405);
});

test('each scope publishes only its completed snapshot to the matching cache', async () => {
  for (const scope of ['rankings', 'tour', 'fixtures']) {
    const snapshot = { updatedAt: '2026-09-17T12:00:00Z' };
    let published = false;
    const response = await handleRefresh(request({ scope }), config, {
      builders: { [scope]: async ({ token }) => { assert.equal(token, config.token); return snapshot; } },
      publish: async (data, options) => {
        assert.equal(data, snapshot);
        assert.equal(options.cachePath, `${scope}-v1.json`);
        assert.equal(options.serviceKey, config.serviceKey);
        published = true;
      },
    });
    assert.equal(response.status, 200);
    assert.ok(published);
  }
});

test('provider failure preserves the cache and hides sensitive errors', async () => {
  const response = await handleRefresh(request({ scope: 'rankings' }), config, {
    builders: { rankings: async () => { throw new Error(config.token); } },
    publish: () => assert.fail('must preserve previous cache'),
  });
  assert.equal(response.status, 502);
  assert.ok(!(await response.text()).includes(config.token));
});
