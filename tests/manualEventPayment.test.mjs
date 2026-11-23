import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { transform } from 'esbuild';

const paths = [
    'supabase/functions/_shared/manual-event-payment.ts',
    'supabase/functions/confirm-manual-payment/manual-event-payment.ts',
    'supabase/functions/paystack-webhook/manual-event-payment.ts',
];

const currentDivision = "Men's Elite (indicative 5+)";
const snapshot = { event_id: 479, email: 'craig@example.com', division_id: 'elite', division: currentDivision,
    payment_status: 'pending', partner_email: 'paul@example.com', partner_payment_status: 'paid', status: 'registered' };
const covers = [{ type: 'entry', email: snapshot.email, division: currentDivision }];
const meta = { event_id: 479, registrant_email: snapshot.email, registration_rows: [snapshot] };
const payment = { id: 'receipt', event_id: 479, metadata: meta, amount: 600 };
const original = { ...snapshot, id: 'original', division: "Men's Open", pay_token: 'original-token', created_at: '2026-09-16' };
for (const path of paths) {
    const fullSource = await fs.readFile(new URL(`../${path}`, import.meta.url), 'utf8');
    const source = fullSource.slice(0, fullSource.indexOf('/**\n * Split a combined'))
        .replace(/^import .*;\n/gm, '');
    const { code } = await transform(source, { loader: 'ts', format: 'esm' });
    const helpers = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

    if (!path.startsWith('outputs/')) {
        test(`${path}: client snapshots cannot grant extra paid entries or administrative fields`, () => {
            const rows=helpers.buildPersistedRegistrationRows([{...snapshot,email:'uncovered@example.com',payment_status:'paid',refund_amount:300,whatsapp_added:true,pay_token:'forged',approved:true}],covers,snapshot.email);
            assert.equal(rows[0].payment_status,'pending');
            for(const field of ['refund_amount','whatsapp_added','pay_token','approved']) assert.equal(rows[0][field],undefined);
        });
        test(`${path}: only a server-priced free entry can be marked paid without an entry cover`, () => {
            const rows=helpers.buildPersistedRegistrationRows([snapshot],[],snapshot.email,[{event_id:snapshot.event_id,email:snapshot.email,division:snapshot.division}]);
            assert.equal(rows[0].payment_status,'paid');
            assert.equal(helpers.buildPersistedRegistrationRows([snapshot],[],snapshot.email)[0].payment_status,'pending');
        });
    }

    test(`${path}: registration persistence uses the atomic verified-payment RPC`, async () => {
        const calls = [], saved = [{ ...original, payment_status: 'paid' }];
        const client = { rpc: async (name, args) => { calls.push({ name, args }); return { data: { savedRows: saved, persisted: true } }; } };
        const result = await helpers.persistManualEventRegistrations(client, payment);
        assert.deepEqual(calls, [{ name: 'finalize_paid_event_checkout', args: { p_payment_id: payment.id } }]);
        assert.equal(result.persisted, true); assert.deepEqual(result.savedRows, saved);
    });
    test(`${path}: an expired paid cart is returned for review instead of announcing registration`, async () => {
        const result = await helpers.persistManualEventRegistrations({ rpc: async () => ({ data: { savedRows: [], persisted: false, needsReview: true } }) }, payment);
        assert.equal(result.needsReview, true); assert.equal(result.persisted, false); assert.deepEqual(result.savedRows, []);
    });
    test(`${path}: RPC failures or malformed results stop finalisation`, async () => {
        await assert.rejects(helpers.persistManualEventRegistrations({ rpc: async () => ({ error: new Error('database failure') }) }, payment), /database failure/);
        await assert.rejects(helpers.persistManualEventRegistrations({ rpc: async () => ({ data: null }) }, payment), /could not be confirmed/);
    });

}
