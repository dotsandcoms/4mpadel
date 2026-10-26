const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const moduleValue = { exports: {} };
const code = ts.transpileModule(fs.readFileSync('src/lib/event-draws.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
vm.runInNewContext(code, { module: moduleValue, exports: moduleValue.exports, Date, Promise });
const { rankedinEventId, eventDrawSource, loadEventDrawStatus, eventDrawPath } = moduleValue.exports;

const hybrid = { id: 470, slug: 'sa-nationals-2026-age-groups', is_manual: true, rankedin_id: '75153' };
const published = [{ Id: 177841, IsPublished: true, ShowDraws: true, TournamentDraws: [{ Id: 644956 }] }];
const unpublished = [{ Id: 177841, IsPublished: false, ShowDraws: false, TournamentDraws: [] }];
function clientFor(rows) {
  const calls = [];
  const client = { from(table) {
    calls.push(table);
    const query = { select() { return query; }, eq() { return query; }, in() { return query; },
      maybeSingle() { return Promise.resolve(rows[table] ?? { data: null, error: null }); },
      then(resolve, reject) { return Promise.resolve(rows[table] ?? { data: [], error: null }).then(resolve, reject); },
    };
    return query;
  } };
  return { client, calls };
}
test('4M registrations with a RankedIn ID use RankedIn draws, matching the website', () => {
  assert.equal(eventDrawSource(hybrid), 'rankedin');
  assert.equal(eventDrawSource({ id: 2, is_manual: true }), 'native');
  assert.equal(eventDrawSource({ id: 3 }), 'none');
});
test('URL-linked and explicit native notification draws select the correct source', () => {
  assert.equal(rankedinEventId({ id: 1, rankedin_url: 'https://www.rankedin.com/en/tournament/75153/nationals' }), '75153');
  assert.equal(rankedinEventId({ id: 1, rankedin_url: 'https://example.com/en/tournament/75153' }), null);
  assert.equal(eventDrawSource(hybrid, true), 'native');
});
test('newly published RankedIn classes override a stale unpublished status without querying native draws', async () => {
  const { client, calls } = clientFor({
    rankedin_results_cache: { data: { has_draw: false, last_synced_at: '2026-10-08T07:16:34Z' } },
    rankedin_cache: { data: { payload: published, updated_at: '2026-10-08T07:24:05Z' } },
  });
  const status = await loadEventDrawStatus(client, hybrid);
  assert.equal(status.source, 'rankedin');
  assert.equal(status.hasDraw, true);
  assert.deepEqual(calls, ['rankedin_results_cache', 'rankedin_cache']);
});
test('empty classes and a cache read failure preserve a known published draw and results', async () => {
  for (const row of [{ data: { payload: [], updated_at: '2026-10-08T08:00:00Z' } }, { error: new Error('offline') }]) {
    const { client } = clientFor({ rankedin_results_cache: { data: { has_draw: true, has_results: true } }, rankedin_cache: row });
    const status = await loadEventDrawStatus(client, hybrid);
    assert.equal(status.hasDraw, true);
    assert.equal(status.hasResults, true);
  }
});
test('new populated unpublished classes withdraw the draw, but an older snapshot cannot hide a newer draw', async () => {
  for (const [time, expected] of [['2026-10-08T08:00:00Z', false], ['2026-10-08T06:00:00Z', true]]) {
    const { client } = clientFor({
      rankedin_results_cache: { data: { has_draw: true, last_synced_at: '2026-10-08T07:00:00Z' } },
      rankedin_cache: { data: { payload: unpublished, updated_at: time } },
    });
    assert.equal((await loadEventDrawStatus(client, hybrid)).hasDraw, expected);
  }
});
test('classes alone can expose a published draw when the results summary is missing', async () => {
  const { client } = clientFor({ rankedin_cache: { data: { payload: published, updated_at: '2026-10-08T08:00:00Z' } } });
  const status = await loadEventDrawStatus(client, hybrid);
  assert.equal(status.hasDraw, true);
  assert.equal(status.hasResults, false);
});
test('native draws retain published-only reads and match state', async () => {
  const { client, calls } = clientFor({ draws: { data: [{ id: 'native', status: 'completed' }] }, draw_matches: { count: 1 } });
  const status = await loadEventDrawStatus(client, { id: 3, is_manual: true });
  assert.equal(status.hasDraw, true);
  assert.equal(status.hasResults, true);
  assert.equal(status.isFinished, true);
  assert.equal(status.isLive, true);
  assert.deepEqual(calls, ['draws', 'draw_matches']);
});
test('draw and result links preserve the selected source for hybrid tournaments', () => {
  assert.equal(eventDrawPath(hybrid, 'rankedin'), '/draws/sa-nationals-2026-age-groups');
  assert.equal(eventDrawPath(hybrid, 'rankedin', true), '/results/sa-nationals-2026-age-groups');
  assert.equal(eventDrawPath(hybrid, 'native'), '/native-draws/sa-nationals-2026-age-groups');
});
