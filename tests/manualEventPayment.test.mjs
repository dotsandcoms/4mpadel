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
const partner = { ...original, id: 'partner', email: 'paul@example.com', partner_email: snapshot.email,
    payment_status: 'paid', partner_payment_status: 'pending' };

function database(registrations, fail = null) {
    const tables = { event_registrations: structuredClone(registrations), payments: [structuredClone(payment)] };
    const writes = [];
    let nextId = 0;
    return { tables, writes, from(table) {
        let operation = 'select', values, filters = [], returning = false;
        const query = {
            select() { returning = true; return this; },
            eq(key, value) { filters.push((row) => row[key] === value); return this; },
            neq(key, value) { filters.push((row) => row[key] !== value); return this; },
            ilike(key, value) { filters.push((row) => String(row[key] || '').toLowerCase() === String(value).toLowerCase()); return this; },
            update(value) { operation = 'update'; values = value; return this; },
            upsert(value) { operation = 'upsert'; values = value; return this; },
            then(resolve) {
                if (fail === `${table}:${operation}`) return resolve({ data: null, error: new Error('database failure') });
                let rows = tables[table].filter((row) => filters.every((filter) => filter(row)));
                if (operation === 'upsert') {
                    let row = tables[table].find((item) => item.event_id === values.event_id && item.email === values.email && item.division === values.division);
                    if (!row) { row = { id: `new-${++nextId}`, pay_token: `token-${nextId}` }; tables[table].push(row); }
                    Object.assign(row, values); rows = [row];
                }
                if (operation === 'update') rows.forEach((row) => Object.assign(row, values));
                if (operation !== 'select') writes.push({ table, operation, values, ids: rows.map((row) => row.id) });
                resolve({ data: operation === 'select' || returning ? structuredClone(rows) : null, error: null });
            },
        };
        return query;
    } };
}

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



    test(`${path}: paying an existing partner uses the booker snapshot division ID`, async () => {
        const client = database([original, { ...partner, payment_status: 'pending' }]);
        await helpers.markManualEventEntryCoversPaid(client, payment, meta, [{ ...covers[0], email: partner.email }]);
        assert.equal(client.tables.event_registrations[1].payment_status, 'paid');
        assert.equal(client.tables.event_registrations[0].partner_payment_status, 'paid');
        assert.equal(client.tables.event_registrations[0].payment_status, 'pending');
    });

    test(`${path}: an unmatched cover cannot report successful finalisation`, async () => {
        await assert.rejects(helpers.markManualEventEntryCoversPaid(database([]), payment, meta, covers), /did not match/);
    });





    test(`${path}: weekly covers remain scoped to each event`, async () => {
        const client = database([479, 480, 481].map((event_id) => ({ ...original, id: String(event_id), event_id, division_id: null, division: 'Open' })));
        const weeklyCovers = [479, 480].map((event_id) => ({ ...covers[0], event_id, division: 'Open' }));
        const weeklyMeta = { ...meta, registration_rows: client.tables.event_registrations };
        await helpers.markManualEventEntryCoversPaid(client, payment, weeklyMeta, weeklyCovers);
        assert.deepEqual(client.tables.event_registrations.map((row) => row.payment_status), ['paid', 'paid', 'pending']);
    });

    test(`${path}: registration persistence uses the atomic verified-payment RPC`, async () => {
        const calls = [], saved = [{ ...original, payment_status: 'paid' }];
        const client = { rpc: async (name, args) => { calls.push({ name, args }); return { data: { savedRows: saved, persisted: true } }; } };
        const result = await helpers.persistManualEventRegistrations(client, payment, meta, covers);
        assert.deepEqual(calls, [{ name: 'finalize_paid_event_checkout', args: { p_payment_id: payment.id } }]);
        assert.equal(result.persisted, true); assert.deepEqual(result.savedRows, saved);
    });
    test(`${path}: an expired paid cart is returned for review instead of announcing registration`, async () => {
        const result = await helpers.persistManualEventRegistrations({ rpc: async () => ({ data: { savedRows: [], persisted: false, needsReview: true } }) }, payment, meta, covers);
        assert.equal(result.needsReview, true); assert.equal(result.persisted, false); assert.deepEqual(result.savedRows, []);
    });
    test(`${path}: RPC failures or malformed results stop finalisation`, async () => {
        await assert.rejects(helpers.persistManualEventRegistrations({ rpc: async () => ({ error: new Error('database failure') }) }, payment, meta, covers), /database failure/);
        await assert.rejects(helpers.persistManualEventRegistrations({ rpc: async () => ({ data: null }) }, payment, meta, covers), /could not be confirmed/);
    });

}
