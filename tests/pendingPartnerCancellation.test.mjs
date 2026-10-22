import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';
import { isPartnerBookingOwner, resolvePartnerPaid } from '../src/utils/partnerPaymentStatus.js';

const ownerEmail = 'zeke@example.com';
const partnerEmail = 'finlay@example.com';
const divisions = [
    { id: 'advanced', event_id: 101, name: "Men's Advanced", entry_fee: 800, is_active: true },
    { id: 'open', event_id: 101, name: "Men's Open", entry_fee: 800, is_active: true },
];
const rows = divisions.flatMap(division => [
    { id: `owner-${division.id}`, event_id: 101, division_id: division.id, division: division.name,
        full_name: 'Zeke Roulstone', email: ownerEmail, registered_by: ownerEmail, status: 'registered',
        payment_status: 'paid', partner_name: 'Finlay Ferguson', partner_email: partnerEmail,
        partner_payment_status: 'paid' }, // Deliberately stale: the partner's own row is authoritative.
    { id: `partner-${division.id}`, event_id: 101, division_id: division.id, division: division.name,
        full_name: 'Finlay Ferguson', email: partnerEmail, registered_by: ownerEmail, status: 'registered',
        payment_status: 'pending', partner_name: 'Zeke Roulstone', partner_email: ownerEmail,
        partner_payment_status: 'paid' },
]);

test('reciprocal invitation links preserve the original inviter as booking owner', () => {
    assert.equal(isPartnerBookingOwner(rows[0], ' ZEKE@EXAMPLE.COM '), true);
    assert.equal(isPartnerBookingOwner(rows[1], partnerEmail), false);
    assert.equal(isPartnerBookingOwner(rows[1], ownerEmail), false);
    assert.equal(isPartnerBookingOwner(rows[0], 'unrelated@example.com'), false);
    assert.equal(isPartnerBookingOwner(null, ''), false);
    assert.equal(isPartnerBookingOwner({ email: ownerEmail }, ownerEmail), false);
    assert.equal(resolvePartnerPaid(rows[0], rows[1]), false);
    assert.equal(resolvePartnerPaid(rows[0], { ...rows[1], payment_status: 'paid' }), true);
});

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), '4m-pending-partner-'));
const output = path.join(temporary, 'fixture.js');
const root = process.cwd();
const mockSupabase = `
import { applyRegistrationWithdrawal, checkRefundEligibility } from '${root}/supabase/functions/paystack-refund/refund-engine.ts';
const scenario = window.__scenario || {};
const viewerEmail = scenario.invitee ? '${partnerEmail}' : '${ownerEmail}';
const event = { id: 101, is_manual: true, event_name: 'Test tournament', start_date: '2099-11-01',
    registration_closes_at: scenario.closed ? '2020-01-01' : '2099-10-31' };
const registrations = ${JSON.stringify(rows)};
if (scenario.paid) for (const row of registrations) row.payment_status = 'paid';
const tables = { event_registrations: registrations, tournament_divisions: ${JSON.stringify(divisions)},
    players: [{ id: 1, email: viewerEmail, name: scenario.invitee ? 'Finlay Ferguson' : 'Zeke Roulstone' }] };
window.__tables = tables;
window.__calls = [];
export const fixtureEvent = event;
export const fixtureEmail = viewerEmail;
export const supabase = {
    auth: { getSession: async () => ({ data: { session: null } }) },
    rpc: async (name) => ({ data: name === 'get_event_registrations_for_matching'
        ? structuredClone(registrations.filter(row => row.status !== 'withdrawn')) : [] }),
    from(table) {
        const filters = [];
        let updates;
        const result = () => {
            const matched = (tables[table] || []).filter(row => filters.every(filter => filter(row)));
            if (updates) for (const row of matched) Object.assign(row, updates);
            return { data: structuredClone(matched), error: null };
        };
        const query = {
            select() { return this; }, order() { return this; }, limit() { return this; },
            eq(key, value) { filters.push(row => row[key] === value); return this; },
            neq(key, value) { filters.push(row => row[key] !== value); return this; },
            lt(key, value) { filters.push(row => row[key] < value); return this; },
            ilike(key, value) { filters.push(row => String(row[key] || '').toLowerCase() === String(value).toLowerCase()); return this; },
            in(key, values) { filters.push(row => values.includes(row[key])); return this; },
            update(values) { updates = values; return this; },
            maybeSingle: async () => ({ ...result(), data: result().data[0] || null }),
            then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
        };
        return query;
    },
    functions: { async invoke(name, { body }) {
        window.__calls.push({ name, body });
        if (window.__rejectRemoval) return { data: { processed: true, refunds: [{ status: 'skipped:closed' }] } };
        if (name !== 'paystack-refund' || body.action !== 'remove_partner') throw new Error('Unexpected operation');
        const owner = registrations.find(row => row.id === body.registration_id);
        if (owner.registered_by !== viewerEmail) throw new Error('Only the booking owner can remove a partner');
        const partner = registrations.find(row => row.email === owner.partner_email && row.division_id === owner.division_id);
        const eligibility = checkRefundEligibility(partner, tables.tournament_divisions, event, viewerEmail, false);
        if (!eligibility.eligible) throw new Error(eligibility.reason);
        await applyRegistrationWithdrawal(supabase, partner);
        return { data: { processed: true, total_refunded_rands: 0, refunds: [{ status: 'processing', registration_id: partner.id }] } };
    } },
};`;

await build({
    stdin: { contents: `
        import React from 'react';
        import { createRoot } from 'react-dom/client';
        import { MemoryRouter } from 'react-router-dom';
        import { Toaster } from 'sonner';
        import Registration from './src/components/ManualEventRegistration.jsx';
        import { fixtureEvent, fixtureEmail } from './src/supabaseClient';
        window.__actions = {};
        createRoot(document.getElementById('root')).render(<MemoryRouter><Toaster />
            <Registration event={fixtureEvent} userEmail={fixtureEmail} theme={{ fill: '#CCFF00' }} registrationActionsRef={window.__actions}
                onStatusChange={status => { window.__status = status; }} />
        </MemoryRouter>);`, resolveDir: root, loader: 'jsx' },
    outfile: output, bundle: true, platform: 'browser', format: 'iife',
    loader: { '.svg': 'dataurl' }, define: { 'process.env.NODE_ENV': '"test"', 'import.meta.env': '{}' },
    plugins: [{ name: 'registration-fixture', setup(builder) {
        builder.onResolve({ filter: /supabaseClient$/ }, () => ({ path: 'supabase', namespace: 'mock' }));
        builder.onResolve({ filter: /\/utils\/licenses$/ }, () => ({ path: 'licenses', namespace: 'mock' }));
        builder.onResolve({ filter: /\/utils\/emails$/ }, () => ({ path: 'emails', namespace: 'mock' }));
        builder.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: {
            supabase: mockSupabase,
            licenses: 'export const eventLicense = async () => ({ active: true, label: "Active" });',
            emails: 'export const sendEmail = async () => {};',
        }[args.path], loader: 'js', resolveDir: root }));
    } }],
});

const clickText = async (page, text, index = 0) => {
    await page.waitForFunction((text, index) => [...document.querySelectorAll('button')].filter(el => el.textContent.trim() === text)[index], {}, text, index);
    await page.evaluate((text, index) => [...document.querySelectorAll('button')].filter(el => el.textContent.trim() === text)[index].click(), text, index);
};

test('pending partner cancellation keeps the paid entry and enables adding another partner', async () => {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.setDefaultTimeout(10000);
        const load = async (scenario = {}) => {
            await page.goto('about:blank');
            await page.setContent('<!doctype html><html><body><div id="root"></div></body></html>');
            await page.evaluate(value => { window.__scenario = value; }, scenario);
            const css = fs.readdirSync(path.join(root, 'dist/assets')).find(name => /^index-.*\.css$/.test(name));
            if (css) await page.addStyleTag({ path: path.join(root, 'dist/assets', css) });
            await page.addScriptTag({ path: output });
            await page.waitForFunction(() => window.__status?.entries?.length === 2);
            await page.evaluate(() => window.__actions.current.openManageEntry());
        };
        await page.setViewport({ width: 1280, height: 960 });
        await load();
        await page.waitForFunction(() => [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Cancel pending entry').length === 2);
        await page.waitForFunction(() => [...document.querySelectorAll('.overflow-hidden')].every(el => !el.style.opacity || el.style.opacity === '1'));
        await page.screenshot({ path: '/tmp/4m-partner-entries-desktop.png' });
        await clickText(page, 'Cancel pending entry');
        await page.waitForFunction(() => document.body.textContent.includes('Your entry and payment stay active'));
        await clickText(page, 'Keep partner');
        assert.equal(await page.evaluate(() => window.__calls.length), 0);

        await page.setViewport({ width: 390, height: 844 });
        await clickText(page, 'Cancel pending entry');
        await page.waitForFunction(() => document.body.textContent.includes('Your entry and payment stay active'));
        await page.waitForFunction(() => document.querySelector('[role="dialog"]')?.style.opacity === '1');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
        await page.screenshot({ path: '/tmp/4m-partner-confirmation-mobile.png' });
        await clickText(page, 'Cancel pending entry', 2);
        await page.waitForFunction(() => window.__status.entries.find(entry => entry.id === 'owner-advanced')?.canAddPartner);
        const state = await page.evaluate(() => ({ rows: window.__tables.event_registrations, calls: window.__calls }));
        assert.equal(state.calls.length, 1);
        assert.deepEqual(state.calls[0], { name: 'paystack-refund', body: { action: 'remove_partner', registration_id: 'owner-advanced' } });
        assert.equal(state.rows.find(row => row.id === 'partner-advanced').status, 'withdrawn');
        assert.equal(state.rows.find(row => row.id === 'owner-advanced').status, 'registered');
        assert.equal(state.rows.find(row => row.id === 'owner-advanced').payment_status, 'paid');
        assert.equal(state.rows.find(row => row.id === 'owner-advanced').partner_email, null);
        assert.equal(state.rows.find(row => row.id === 'partner-open').status, 'registered');
        assert.equal(state.rows.find(row => row.id === 'owner-open').partner_email, partnerEmail);
        await clickText(page, 'Add Partner');
        await page.waitForFunction(() => document.body.textContent.includes('Continue to Review'));

        await load({ invitee: true });
        assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].some(b => b.textContent.includes('Cancel pending entry'))), false);
        await page.evaluate(() => window.__actions.current.openRemovePartner('partner-advanced'));
        assert.equal(await page.evaluate(() => document.body.textContent.includes('Cancel pending partner entry?')), false);
        await load({ closed: true });
        assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].some(b => b.textContent.includes('Cancel pending entry'))), false);
        await load({ paid: true });
        await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Remove partner'));
        assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].some(b => b.textContent.includes('Cancel pending entry'))), false);

        await load();
        await page.evaluate(() => { window.__rejectRemoval = true; });
        await clickText(page, 'Cancel pending entry');
        await page.waitForFunction(() => document.body.textContent.includes('Your entry and payment stay active'));
        await clickText(page, 'Cancel pending entry', 2);
        await page.waitForFunction(() => document.body.textContent.includes('Partner entry could not be cancelled'));
        assert.equal(await page.evaluate(() => window.__status.entries.every(entry => entry.hasPartner)), true);
        assert.deepEqual(errors, []);
    } finally {
        await browser.close();
        fs.rmSync(temporary, { recursive: true, force: true });
    }
});
