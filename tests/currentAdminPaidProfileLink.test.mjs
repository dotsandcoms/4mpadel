import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';

const event = { id: 101, event_name: 'Synthetic Open', is_manual: true, event_status: 'active', entry_fee: 400 };
const division = { id: 'open-division', event_id: 101, name: 'Open', entry_fee: 400 };
const registration = { id: 'verified-slot', event_id: 101, email: 'current@example.invalid', full_name: 'Current Player',
    division: 'Open', division_id: division.id, payment_status: 'paid', payment_method: 'paystack', status: 'registered' };
const current = { id: 11, name: registration.full_name, email: registration.email };
const candidate = { id: 22, name: 'Next Player', email: 'next@example.invalid' };
const payment = { id: 'receipt', event_id: 101, status: 'success', amount: 400, payment_type: 'event_entry_fee',
    payment_method: 'paystack', reference: 'REGEV-paid-profile-fixture', metadata: {
        source: 'manual_event', registrant_email: 'payer@example.invalid',
        covers: [{ type: 'entry', email: 'former@example.invalid', division: 'Open' }],
        division_entry_fees: { Open: 400 },
        verified_entry_transfers: [{ cover_position: 1, registration_id: registration.id, event_id: 101,
            division: 'Open', division_id: division.id }],
    } };

const mockClient = `
const fixture = window.fixture;
const tables = { calendar:[fixture.event], tournament_divisions:[fixture.division], event_registrations:[fixture.registration],
    payments:[fixture.payment], players:[fixture.current] };
function from(table) {
    let updating = false;
    const answer = () => ({ data: updating ? [] : tables[table] || [], error: null });
    return {
        select(){return this;}, order(){return this;}, eq(){return this;}, neq(){return this;}, in(){return this;},
        or(){return this;}, lt(){return this;}, is(){return this;}, limit(){return this;}, range(){return this;},
        async maybeSingle(){return {data:answer().data[0] || null,error:null};},
        then(resolve){return Promise.resolve(answer()).then(resolve);},
        update(data){updating=true;fixture.writes.push([table,data]);return this;},
    };
}
export const supabase = {
    auth:{async getUser(){return {data:{user:{email:'operator@example.invalid'}}};}},
    from, functions:{async invoke(){return {data:null,error:null};}},
    async rpc(name,args) {
        if (name==='replace_registration_player') {
            fixture.replacements.push(args);
            return {data:{registration_id:fixture.registration.id,new_email:fixture.candidate.email},error:null};
        }
        return {data:[fixture.candidate],error:null};
    },
};
`;

test('Current Admin routes a transferred entry’s profile link into the existing replacement confirmation', async () => {
    const output = await build({
        stdin: { contents: `
            import React from 'react';
            import { createRoot } from 'react-dom/client';
            import ManualEventRegistrations from './src/components/admin/ManualEventRegistrations.jsx';
            createRoot(document.getElementById('root')).render(<ManualEventRegistrations event={window.fixture.event} isOpen variant="inline" />);
        `, loader: 'jsx', resolveDir: process.cwd() },
        bundle: true, write: false, format: 'iife', jsx: 'automatic', loader: { '.png': 'dataurl', '.jpg': 'dataurl', '.svg': 'dataurl', '.css': 'empty' },
        define: { 'import.meta.env': '{}' },
        plugins: [{ name: 'synthetic-paid-profile-link', setup(plugin) {
            plugin.onResolve({ filter: /supabaseClient$/ }, args => ({ path: args.path, namespace: 'client' }));
            plugin.onLoad({ filter: /.*/, namespace: 'client' }, () => ({ contents: mockClient }));
            plugin.onResolve({ filter: /useAdminPermissions$/ }, args => ({ path: args.path, namespace: 'permissions' }));
            plugin.onLoad({ filter: /.*/, namespace: 'permissions' }, () => ({ contents: 'export const useAdminPermissions=()=>({permissions:{role:"super_admin"}});' }));
        } }],
    });
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    try {
        const page = await browser.newPage();
        const pageErrors = [];
        page.on('pageerror', error => pageErrors.push(error.message));
        await page.setContent('<main id="root"></main>');
        await page.evaluate(payload => { window.fixture = payload; },
            { event, division, registration, current, candidate, payment, writes: [], replacements: [] });
        await page.addScriptTag({ content: output.outputFiles[0].text });
        const click = async (selector, label) => {
            const target = await page.waitForFunction((query, text) =>
                [...document.querySelectorAll(query)].find(node => !node.disabled && (!text || node.textContent.includes(text))),
            { polling: 50, timeout: 6000 }, selector, label).catch(async error => {
                const details = await page.evaluate(() => document.body.innerText.slice(0, 1000));
                throw new Error(`Could not open ${label || selector}. ${details} ${pageErrors.join(' ')}`, { cause: error });
            });
            try { await target.evaluate(node => node.click()); } finally { await target.dispose(); }
        };
        await click('button', 'Registrations List');
        await click('button[title="Change linked profile"]');
        await click('button', candidate.name);
        await page.waitForFunction(() => document.querySelector('dialog[open]')?.textContent.includes('Current Player → Next Player'),
            { polling: 50, timeout: 6000 });
        const before = await page.evaluate(() => window.fixture);
        assert.deepEqual(before.replacements, []);
        assert.deepEqual(before.writes, [['payments', { status: 'abandoned' }]]);
        await click('dialog[open] button[type="submit"]', 'Replace player');
        await page.waitForFunction(() => window.fixture.replacements.length === 1, { polling: 50, timeout: 6000 });
        const after = await page.evaluate(() => window.fixture);
        assert.deepEqual(after.replacements, [{
            p_registration_id: registration.id, p_expected_email: registration.email,
            p_expected_partner_email: null, p_new_player_id: candidate.id,
        }]);
        assert.ok(after.writes.every(([table, change]) => table === 'payments' && change.status === 'abandoned'));
    } finally {
        await browser.close();
    }
});
