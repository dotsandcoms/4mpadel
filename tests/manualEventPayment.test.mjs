import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { transform } from 'esbuild';

const paths = [
    'supabase/functions/_shared/manual-event-payment.ts',
    'supabase/functions/confirm-manual-payment/manual-event-payment.ts',
    'supabase/functions/paystack-webhook/manual-event-payment.ts',
    'outputs/division-rename-repair/edge/confirm-manual-payment/manual-event-payment.ts',
    'outputs/division-rename-repair/edge/paystack-webhook/manual-event-payment.ts',
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

    test(`${path}: renamed division keeps one original entry, token and partner payment`, async () => {
        const client = database([original, partner]);
        const result = await helpers.persistManualEventRegistrations(client, payment, meta, covers);
        await helpers.markManualEventEntryCoversPaid(client, payment, meta, covers);
        assert.equal(client.tables.event_registrations.length, 2);
        assert.equal(result.savedRows[0].id, 'original');
        assert.equal(result.savedRows[0].pay_token, 'original-token');
        assert.equal(result.savedRows[0].division, currentDivision);
        assert.equal(client.tables.event_registrations[0].payment_status, 'paid');
        assert.equal(client.tables.event_registrations[1].partner_payment_status, 'paid');
        assert.equal(client.tables.payments[0].amount, 600);
        assert.equal(client.writes.some((write) => write.operation === 'upsert'), false);
    });

    test(`${path}: checkout email casing reuses the invited entry and updates its partner`, async () => {
        const invited = { ...original, email: 'Craig@Example.com', division: currentDivision };
        const teammate = { ...partner, partner_email: invited.email, division: currentDivision };
        const client = database([invited, teammate]);

        const result = await helpers.persistManualEventRegistrations(client, payment, meta, covers);
        await helpers.markManualEventEntryCoversPaid(client, payment, meta, covers);

        assert.equal(client.tables.event_registrations.length, 2, 'Do not insert a second entry with a lowercased email');
        assert.equal(result.savedRows[0].id, invited.id);
        assert.equal(result.savedRows[0].pay_token, invited.pay_token);
        assert.equal(client.tables.event_registrations[0].payment_status, 'paid');
        assert.equal(client.tables.event_registrations[1].partner_payment_status, 'paid');
        assert.equal(client.tables.payments[0].metadata.registrations_persisted, true);
        assert.equal(client.writes.some((write) => write.operation === 'upsert'), false);
    });

    test(`${path}: another division and another player stay unpaid`, async () => {
        const other = { ...original, id: 'other-division', division_id: 'advanced', division: "Men's Advanced" };
        const stranger = { ...original, id: 'stranger', email: 'someone@example.com' };
        const client = database([original, other, stranger]);
        await helpers.persistManualEventRegistrations(client, payment, meta, covers);
        await helpers.markManualEventEntryCoversPaid(client, payment, meta, covers);
        assert.deepEqual(client.tables.event_registrations.map((row) => row.payment_status), ['paid', 'pending', 'pending']);
    });

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

    test(`${path}: an unpaid snapshot cannot demote an already-paid partner`, async () => {
        const partnerSnapshot = { ...snapshot, email: partner.email, partner_email: snapshot.email, partner_payment_status: 'pending' };
        const client = database([original, partner]);
        await helpers.persistManualEventRegistrations(client, payment, { ...meta, registration_rows: [snapshot, partnerSnapshot] }, covers);
        const savedPartner = client.tables.event_registrations.find((row) => row.id === partner.id);
        assert.equal(savedPartner.payment_status, 'paid');
        assert.equal(savedPartner.division, "Men's Open", 'Preserve the division label on the earlier partner receipt');
    });

    test(`${path}: new entries insert once and replay preserves the ID`, async () => {
        const client = database([]);
        await helpers.persistManualEventRegistrations(client, payment, meta, covers);
        await helpers.persistManualEventRegistrations(client, payment, meta, covers);
        assert.equal(client.tables.event_registrations.length, 1);
        assert.equal(client.tables.event_registrations[0].id, 'new-1');
        assert.equal(client.tables.payments[0].metadata.registrations_persisted, true);
    });

    test(`${path}: equal names cannot overwrite a different linked division`, async () => {
        const client = database([{ ...original, division: currentDivision, division_id: 'unrelated' }]);
        await assert.rejects(helpers.persistManualEventRegistrations(client, payment, meta, covers), /different division/);
        assert.equal(client.writes.length, 0);
    });

    test(`${path}: legacy entries without IDs still match by name`, async () => {
        const legacy = { ...original, division_id: null, division: 'Open' };
        const legacyMeta = { ...meta, registration_rows: [{ ...snapshot, division_id: null, division: 'Open' }] };
        const client = database([legacy]);
        await helpers.persistManualEventRegistrations(client, payment, legacyMeta, [{ ...covers[0], division: 'Open' }]);
        assert.equal(client.tables.event_registrations.length, 1);
        assert.equal(client.tables.event_registrations[0].id, 'original');
    });

    test(`${path}: weekly covers remain scoped to each event`, async () => {
        const client = database([479, 480, 481].map((event_id) => ({ ...original, id: String(event_id), event_id, division_id: null, division: 'Open' })));
        const weeklyCovers = [479, 480].map((event_id) => ({ ...covers[0], event_id, division: 'Open' }));
        const weeklyMeta = { ...meta, registration_rows: client.tables.event_registrations };
        await helpers.markManualEventEntryCoversPaid(client, payment, weeklyMeta, weeklyCovers);
        assert.deepEqual(client.tables.event_registrations.map((row) => row.payment_status), ['paid', 'paid', 'pending']);
    });

    test(`${path}: database failures stop finalisation`, async () => {
        const lookupFailure = database([original], 'event_registrations:select');
        await assert.rejects(helpers.persistManualEventRegistrations(lookupFailure, payment, meta, covers), /database failure/);
        assert.equal(lookupFailure.writes.length, 0);
        await assert.rejects(helpers.markManualEventEntryCoversPaid(database([original], 'event_registrations:update'), payment, meta, covers), /database failure/);
        await assert.rejects(helpers.persistManualEventRegistrations(database([original], 'payments:update'), payment, meta, covers), /database failure/);
    });
}
