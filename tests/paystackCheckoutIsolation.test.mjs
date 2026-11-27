import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const { outputFiles } = await build({
    entryPoints: [new URL('../src/utils/organisationPaystack.js', import.meta.url).pathname],
    bundle: true, write: false, format: 'esm',
    plugins: [{
        name: 'isolated-checkout',
        setup(builder) {
            builder.onResolve({ filter: /supabaseClient$/ }, () => ({ path: 'client', namespace: 'fixture' }));
            builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
                contents: 'export const supabase = { from: (...args) => globalThis.paystackFixture.from(...args), functions: { invoke: (...args) => globalThis.paystackFixture.invoke(...args) } };',
            }));
        },
    }],
});
const { prepareWebEventPayment, openEventPayment } = await import(
    'data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64')
);

test('unselected tournaments keep the existing checkout even when the subaccount service is unavailable', async () => {
    const payment = { event_id: 173, reference: 'legacy-checkout' };
    globalThis.paystackFixture = {
        from(table) {
            assert.equal(table, 'payments');
            return { insert: async row => { assert.deepEqual(row, payment); return { error: null }; } };
        },
        invoke() { throw new Error('Unselected tournaments must not call the settlement function'); },
    };
    assert.deepEqual(await prepareWebEventPayment(payment, false), { legacy: true });
});

test('a selected tournament uses the authorised checkout code and errors cannot fall back to the primary account', async () => {
    const payment = { event_id: 173, reference: 'routed-checkout' };
    globalThis.paystackFixture = {
        from() { assert.fail('A selected tournament must not write a legacy payment'); },
        async invoke(name, { body }) {
            assert.equal(name, 'paystack-organisation-settlement');
            assert.deepEqual(body, { action: 'web_checkout', payment });
            return { data: { accessCode: 'server-issued-code' } };
        },
    };
    const checkout = await prepareWebEventPayment(payment, true);
    const popup = {
        resumeTransaction(code) { assert.equal(code, 'server-issued-code'); },
        checkout() { assert.fail('A routed checkout must not use the primary account'); },
    };
    openEventPayment(popup, checkout, {}, {});
    globalThis.paystackFixture.invoke = async () => ({ data: { legacy: true } });
    await assert.rejects(prepareWebEventPayment(payment, true), /checkout could not start/);
});
