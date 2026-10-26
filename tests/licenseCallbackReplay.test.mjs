import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { transform } from 'esbuild';

for (const path of ['supabase/functions/paystack-webhook/index.ts', 'supabase/functions/confirm-manual-payment/index.ts']) {
  const source = (await fs.readFile(path, 'utf8')).replace('async function finalizeManualEventPayment(', 'export async function finalizeManualEventPayment(');
  const { code } = await transform(source, { loader: 'ts', format: 'cjs' });
  const mod = { exports: {} };
  vm.runInNewContext(code, { module: mod, exports: mod.exports, require: () => ({ serve() {}, parseMetadata: value => value }), Deno: { env: { get: () => '' } } });
  test(`${path}: a verified replay finalizes an existing successful ledger row without duplicate side effects`, async () => {
    const writes = [];
    const database = { from(table) {
      const write = { table, filters: [], values: null, claimed: false };
      const q = { update(values) { write.values = values; return q; }, eq(k, v) { write.filters.push([k, v]); return q; }, neq() { write.claimed = true; return q; }, select() { return q; }, then(resolve) { writes.push(write); return Promise.resolve({ data: [], error: null }).then(resolve); } };
      return q;
    } };
    const result = await mod.exports.finalizeManualEventPayment(database, { id: 'paid-license-checkout', metadata: { source: 'manual_event', covers: [] } });
    assert.equal(result.alreadyProcessed, true);
    assert.equal(writes.length, 2);
    assert.equal(writes[1].table, 'payments');
    assert.equal(writes[1].values.status, 'success');
    assert.equal(writes[1].claimed, false);
    assert.deepEqual(writes[1].filters[0], ['id', 'paid-license-checkout']);
  });
}
