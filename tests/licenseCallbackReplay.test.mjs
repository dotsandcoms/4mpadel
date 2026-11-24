import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { transform } from 'esbuild';

for (const path of ['supabase/functions/paystack-webhook/index.ts', 'supabase/functions/confirm-manual-payment/index.ts']) {
  const source = (await fs.readFile(path, 'utf8')).replace('async function finalizeManualEventPayment(', 'export async function finalizeManualEventPayment(');
  const { code } = await transform(source, { loader: 'ts', format: 'cjs' });
  const mod = { exports: {} };
  const finalisations = [];
  vm.runInNewContext(code, { module: mod, exports: mod.exports, require: () => ({
    serve() {}, traceEdgeRequest: (_route, handler) => handler, parseMetadata: value => value,
    async persistManualEventRegistrations(_client, receipt) { finalisations.push(receipt.id); return { savedRows: [], persisted: false }; },
    async markManualEventEntryCoversPaid() {}, async recordLicensePaymentSplit() {},
  }), Deno: { env: { get: () => '' } } });
  test(`${path}: a verified replay finalizes an existing successful ledger row without duplicate side effects`, async () => {
    const writes = [];
    const receipt = { id: 'paid-license-checkout', status: 'success', metadata: { source: 'manual_event', covers: [] } };
    const reads = [];
    const database = { from(table) {
      const write = { table, filters: [], values: null, claimed: false };
      const q = { update(values) { write.values = values; return q; }, eq(k, v) { write.filters.push([k, v]); return q; }, neq() { write.claimed = true; return q; }, select() { return q; }, async maybeSingle() { reads.push(write); return { data: receipt, error: null }; }, then(resolve) { writes.push(write); return Promise.resolve({ data: [], error: null }).then(resolve); } };
      return q;
    } };
    const result = await mod.exports.finalizeManualEventPayment(database, receipt);
    assert.equal(result.alreadyProcessed, true);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].table, 'payments');
    assert.equal(writes[0].values.status, 'success');
    assert.equal(writes[0].claimed, true);
    assert.deepEqual(writes[0].filters[0], ['id', 'paid-license-checkout']);
    assert.equal(reads.length, 1);
    assert.deepEqual(finalisations, ['paid-license-checkout']);
  });
}
