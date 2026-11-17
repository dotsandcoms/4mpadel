import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { transform } from 'esbuild';

const { code } = await transform(await fs.readFile('supabase/functions/confirm-manual-payment/checkout-access.ts', 'utf8'), { loader: 'ts', format: 'esm' });
const { canConfirmEventCheckout } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

for (const state of ['awaiting_payment', 'expired', 'paid', 'review']) {
    test(`confirmation checks caller scope for ${state} receipts`, async () => {
        const client = { async rpc(name, args) {
            assert.equal(name, 'event_checkout_state');
            assert.deepEqual(args, { p_reference: 'checkout-123' });
            return { data: { state }, error: null };
        } };
        assert.equal(await canConfirmEventCheckout(client, 'checkout-123'), true);
    });
}

for (const result of [
    { data: null, error: { code: '42501' } },
    { data: { state: 'paid' }, error: { code: '42501' } },
    { data: null, error: null },
    { data: {}, error: null },
]) {
    test(`confirmation rejects denied or missing checkout access: ${JSON.stringify(result)}`, async () => {
        assert.equal(await canConfirmEventCheckout({ async rpc() { return result; } }, 'foreign'), false);
    });
}
