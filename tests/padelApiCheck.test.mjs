import test from 'node:test';
import assert from 'node:assert/strict';
import { checkPadelAccess, createPadelReader } from '../scripts/lib/padel-api-check.mjs';

const page = (data) => ({ data, meta: { current_page: 1 } });
const players = [
  { id: 1, name: 'Example man', category: 'men', type: 'official', ranking: 1 },
  { id: 2, name: 'Example woman', category: 'women', type: 'official', ranking: 1 },
];
const sampleRead = async (path, params) => {
  if (path === '/api/rankings') return page(players.filter((p) => p.category === params.category));
  const player = players.find((p) => path === `/api/players/${p.id}` || path === `/api/players/${p.id}/matches`);
  if (path.endsWith('/matches')) return page([{
    id: 30 + player.id, status: 'finished', duration: 'hidden_free_plan',
    players: { team_1: [player], team_2: [{ id: 99 }] },
  }]);
  return player;
};

test('credentials stay on the fixed provider origin and redirects are not followed', async () => {
  let calls = 0;
  const read = createPadelReader('test-token', async (url, options) => {
    calls++;
    assert.equal(url.origin, 'https://padelapi.org');
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    assert.equal(options.redirect, 'manual');
    return Response.json(page([]));
  });
  await read('/api/rankings', { category: 'men' });
  for (const path of ['https://other.example/api/rankings', '//other.example/api/rankings', '/api/players/../rankings']) {
    await assert.rejects(read(path), /Unsupported/);
  }
  assert.equal(calls, 1);
  assert.throws(() => createPadelReader(''), /Set PADEL_API_TOKEN/);
});

test('provider failures stop without exposing response bodies or retrying', async () => {
  for (const status of [301, 401, 402, 429, 500]) {
    let calls = 0;
    const read = createPadelReader('private-token', async () => {
      calls++;
      return new Response('private-token echoed by upstream', { status });
    });
    await assert.rejects(read('/api/rankings'), (error) => !error.message.includes('private-token'));
    assert.equal(calls, 1);
  }
  const read = createPadelReader('private-token', async () => { throw new Error('private-token'); });
  await assert.rejects(read('/api/rankings'), /could not be reached/);
});

test('samples both categories, paces requests and reports restricted fields', async () => {
  const pauses = [];
  const report = await checkPadelAccess({ read: sampleRead, wait: async (ms) => pauses.push(ms) });
  assert.deepEqual(pauses, Array(5).fill(6500));
  assert.deepEqual(report.categories.map((c) => c.category), ['men', 'women']);
  assert.ok(report.categories.every((c) => c.restrictedFields.includes('matches.0.duration')));
});

test('does not report success for changed identity, bad pagination or unrelated matches', async () => {
  for (const mutation of ['identity', 'pagination', 'membership']) {
    const read = async (path, params) => {
      const data = structuredClone(await sampleRead(path, params));
      if (mutation === 'pagination' && path === '/api/rankings') delete data.meta;
      if (mutation === 'identity' && path === '/api/players/1') data.id = 999;
      if (mutation === 'membership' && path.endsWith('/matches')) data.data[0].players.team_1 = [null];
      return data;
    };
    await assert.rejects(checkPadelAccess({ read, wait: async () => {} }), /pagination|identity|relationships/);
  }
});

test('empty matches remain explicitly unverified', async () => {
  const read = (path, params) => path.endsWith('/matches') ? page([]) : sampleRead(path, params);
  const report = await checkPadelAccess({ read, wait: async () => {} });
  assert.ok(report.categories.every((c) => c.matchRows === 0 && c.note.includes('not yet verified')));
});
