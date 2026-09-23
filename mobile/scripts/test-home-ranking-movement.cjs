const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync('src/lib/rankings.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const player = { rankedin_id: 'R000328907', rank_label: '33', category: 'Men' };
const row = (rank, change) => ({ RankedinId: player.rankedin_id, Standing: rank, StandingDiff: change });
function setup(cached, live, fail = false) {
  let requests = 0;
  const query = { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: { payload: { Payload: [cached] }, updated_at: new Date().toISOString() } }; } };
  const mod = { exports: {} };
  vm.runInNewContext(source, { module: mod, exports: mod.exports, require: () => ({ supabase: { from: () => query } }), Date, AbortController, setTimeout, clearTimeout,
    fetch: async () => { requests++; if (fail) throw new Error('Offline'); return { ok: true, json: async () => ({ Payload: [live] }) }; } });
  return { run: () => mod.exports.fetchHomeRankingChange(player), requests: () => requests };
}
test('fresh cache timestamp with old ranking triggers live refresh', async () => {
  const api = setup(row(29, 0), row(33, -4));
  assert.equal(await api.run(), -4);
  assert.equal(api.requests(), 1);
});
test('matching cached ranking avoids an extra live request', async () => {
  const api = setup(row(33, -4), row(33, -4));
  assert.equal(await api.run(), -4);
  assert.equal(api.requests(), 0);
});
test('offline mismatch does not display incorrect movement', async () => {
  const api = setup(row(29, 0), null, true);
  assert.equal(await api.run(), null);
});
