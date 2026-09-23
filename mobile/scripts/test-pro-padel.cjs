const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');

function load(options = {}) {
  const module = { exports: {} };
  const calls = [];
  const query = {};
  for (const method of ['insert', 'delete', 'eq', 'select', 'order']) query[method] = (...args) => { calls.push([method, ...args]); return query; };
  query.then = (resolve, reject) => Promise.resolve(options.result || { data: [{ player_id: 66 }], error: null }).then(resolve, reject);
  const code = ts.transpileModule(fs.readFileSync('src/lib/pro-padel.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: () => ({ supabase: {
    from: table => { calls.push(['from', table]); return query; },
    storage: { from: bucket => ({ getPublicUrl: file => ({ data: { publicUrl: `https://example.test/${bucket}/${file}` } }) }) },
  } }), fetch: options.fetch, AbortController, setTimeout, clearTimeout, Intl, Date });
  return { api: module.exports, calls };
}
const person = id => ({ id, name: `Player ${id}` });
const match = (id, teams, overrides = {}) => ({ id, category: 'men', round: 1, tournamentName: 'Paris', status: 'finished', winner: 'team_1', playedAt: '2026-09-13', teams: teams.map(t => t.map(person)), score: [['7', '6(1)'], ['6', '3']], ...overrides });
const stamp = { version: 1, updatedAt: '2026-09-18T05:00:00Z' };

test('following both pairs yields one result, unrelated matches stay out, and women filter is respected', () => {
  const { api } = load();
  const one = match(1, [[66, 65], [115, 114]]);
  const two = match(2, [[434, 435], [440, 441]], { category: 'women' });
  const rows = [one, one, two, match(3, [[9, 10], [11, 12]])];
  assert.deepEqual(Array.from(api.selectProMatches(rows, [66, 65, 115, 434]), m => m.id), [1, 2]);
  assert.deepEqual(Array.from(api.selectProMatches(rows, [66, 434], 'women'), m => m.id), [2]);
  assert.equal(api.selectProMatches(rows, []).length, 0);
  assert.equal(api.selectProMatches(rows, null).length, 3);
});
test('upcoming fixtures put known times first and results put latest date then final first', () => {
  const { api } = load();
  const rows = [match(1, [[1], [2]], { scheduledAt: null }), match(2, [[1], [2]], { scheduledAt: '2026-09-28T13:00:00Z' }), match(3, [[1], [2]], { scheduledAt: '2026-09-28T09:00:00Z' })];
  assert.deepEqual(Array.from(api.selectProMatches(rows, null, 'all', true), m => m.id), [3, 2, 1]);
  assert.deepEqual(Array.from(api.selectProMatches([match(4, [[1], [2]], { playedAt: '2026-09-12' }), match(5, [[1], [2]], { round: 2 }), rows[0]], null), m => m.id), [1, 5, 4]);
});
test('unpublished draws and tie-break score strings survive validation; malformed snapshots fail', () => {
  const { api } = load();
  const fixture = { ...stamp, coverage: 'Next event', tournament: { name: 'Rotterdam', startDate: '2026-09-28' }, drawPublished: false, matches: [] };
  assert.equal(api.parseProSnapshot('fixtures', fixture).drawPublished, false);
  const tour = { ...stamp, coverage: 'Quarter-finals onward', tournaments: [], matches: [match(1, [[1, 2], [3, 4]])] };
  assert.equal(api.parseProSnapshot('tour', tour).matches[0].score[0][1], '6(1)');
  assert.throws(() => api.parseProSnapshot('tour', { ...tour, matches: [{ ...tour.matches[0], teams: null }] }));
  assert.throws(() => api.parseProSnapshot('tour', { ...tour, updatedAt: 'bad date' }));
  assert.throws(() => api.parseProSnapshot('rankings', { ...stamp, categories: { men: { players: [] } } }));
  assert.throws(() => api.parseProSnapshot('fixtures', { ...fixture, drawPublished: undefined }));
});
test('byes and walkovers keep their labels and stale data is explicit', () => {
  const { api } = load();
  assert.equal(api.proStatus({ status: 'bye' }), 'Bye');
  assert.equal(api.proStatus({ status: 'walkover' }), 'Walkover');
  assert.equal(api.proStatus({ status: 'retired' }), 'Retirement');
  assert.equal(api.proStale(stamp.updatedAt, Date.parse('2026-09-20T05:00:01Z')), true);
  assert.match(api.proDate('2026-09-18T22:30:00Z', true), /19 Sept?.*00:30.*SAST/);
});
test('loader reads public cache only and rejects HTTP errors', async () => {
  let url;
  const { api } = load({ fetch: async value => { url = value; return { ok: true, json: async () => ({ ...stamp, categories: { men: { players: [] }, women: { players: [] } } }) }; } });
  await api.fetchProSnapshot('rankings');
  assert.equal(url, 'https://example.test/pro-padel/rankings-v1.json');
  await assert.rejects(load({ fetch: async () => ({ ok: false }) }).api.fetchProSnapshot('tour'));
});
test('unfollow scopes deletion to account and player; errors never report success', async () => {
  const row = { player_id: 66, player_name: 'Agustin Tapia', category: 'men' };
  const { api, calls } = load();
  await api.setProFollow('account-a', row, false);
  assert.ok(calls.some(c => c[0] === 'eq' && c[1] === 'user_id' && c[2] === 'account-a'));
  assert.ok(calls.some(c => c[0] === 'eq' && c[1] === 'player_id' && c[2] === 66));
  await assert.rejects(load({ result: { error: { code: '42501' } } }).api.setProFollow('account-a', row, true));
  await assert.rejects(load({ result: { data: [] } }).api.setProFollow('account-a', row, true));
  await load({ result: { error: { code: '23505' } } }).api.setProFollow('account-a', row, true);
});
