import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';

const root = process.cwd();
const temp = await mkdtemp(path.join(tmpdir(), '4m-admin-current-events-'));
const output = path.join(temp, 'fixture.js');
let browser;

const supabase = `
    const events = [{ id: 523, event_name: 'Quick Open', venue: 'Club', city: 'Cape Town', start_date: '2030-11-20', is_visible: true,
        is_manual: true, is_quick_event: true, sapa_status: 'Bronze', organisation_id: 'org-a' }];
    export const supabase = { from(table) {
        let rows = table === 'calendar' ? events : [];
        const query = { select() { return query; }, order() { return query; }, in() { return query; },
            eq(field, value) { rows = rows.filter(row => row[field] === value); return query; },
            then(resolve) { return Promise.resolve({ data: rows, error: null }).then(resolve); } };
        return query;
    } };
`;

const mocks = {
    supabaseClient: supabase,
    useRankedin: 'export const useRankedin = () => ({});',
    recentResults: 'export const promoteFinishedTiersToRecentResults = () => { throw new Error("Global promotion must be skipped for scoped Calendar"); };',
    EventBuilder: 'import React from "react"; export default props => props.isOpen ? <div data-modal="full">{props.editingEvent?.event_name || "New event"}<button onClick={props.onClose}>Close</button></div> : null;',
    QuickEventBuilder: 'import React from "react"; export default props => props.isOpen ? <div data-modal="quick">{props.editingEvent?.event_name || "New quick event"}<button onClick={props.onClose}>Close</button></div> : null;',
    EventManagement: 'import React from "react"; export default props => <output data-event={props.initialEventId} data-tab={props.initialRegistrationTab}>{props.allowedEvents?.join(",")}</output>;',
};

before(async () => {
    await build({
        stdin: { contents: `import React from 'react'; import { createRoot } from 'react-dom/client';
            import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
            import { CurrentCalendar, CurrentEvents } from './src/pages/admin-preview/current/CurrentEvents.jsx';
            function Fixture() {
                const location = useLocation();
                window.__navigate = useNavigate();
                const props = { session: { user: { id: 'fixture-user' } }, scopeId: 'org:org-a', permissions: window.__permissions };
                return <><output data-location={location.search} />{location.pathname.endsWith('/calendar') ? <CurrentCalendar {...props} /> : <CurrentEvents {...props} page="events" />}</>;
            }
            createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={[window.__path]}><Fixture /></MemoryRouter>);`,
            resolveDir: root, loader: 'jsx' },
        outfile: output, bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic',
        plugins: [{ name: 'events-current-fixture', setup(builder) {
            builder.onResolve({ filter: /\/(supabaseClient|useRankedin|recentResults|EventBuilder|QuickEventBuilder|EventManagement)$/ }, args => ({ path: args.path.split('/').at(-1), namespace: 'mock' }));
            builder.onLoad({ filter: /./, namespace: 'mock' }, args => ({ contents: mocks[args.path], loader: 'jsx', resolveDir: root }));
        } }],
        loader: { '.png': 'dataurl', '.jpg': 'dataurl', '.webp': 'dataurl' },
    });
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
});

after(async () => {
    await browser?.close();
    await rm(temp, { recursive: true, force: true });
});

async function open(url, permissions = { role: 'super_admin' }) {
    const page = await browser.newPage();
    page.setDefaultTimeout(6_000);
    await page.setRequestInterception(true);
    page.on('request', request => request.abort());
    await page.setContent('<main id="root"></main>');
    await page.evaluate((url, permissions) => { window.__path = url; window.__permissions = permissions; }, url, permissions);
    await page.addScriptTag({ path: output });
    return page;
}

test('Calendar opens the current full and quick editors and consumes route commands', async () => {
    const page = await open('/admin-preview/calendar?create=full&keep=1');
    try {
        await page.waitForSelector('[data-modal="full"]');
        await page.waitForSelector('[data-location="?keep=1"]');
        await page.click('[data-modal="full"] button');
        await page.evaluate(() => window.__navigate('/admin-preview/calendar?create=quick'));
        await page.waitForSelector('[data-modal="quick"]');
        await page.waitForSelector('[data-location=""]');
        await page.click('[data-modal="quick"] button');
        await page.evaluate(() => window.__navigate('/admin-preview/calendar?calendarEvent=523'));
        await page.waitForFunction(() => document.querySelector('[data-modal="quick"]')?.textContent.includes('Quick Open'));
        assert.match(await page.$eval('[data-modal="quick"]', node => node.textContent), /Quick Open/);
        await page.waitForSelector('[data-location=""]');
    } finally { await page.close(); }
});

test('the retired tournament route opens the event draws and preserves assigned event access', async () => {
    const page = await open('/admin-preview/tournaments?event=523', { role: 'custom', module_permissions: { 'event-mgmt': { allowedEvents: [523] } } });
    try {
        await page.waitForSelector('[data-event="523"][data-tab="draws"]');
        assert.equal(await page.$eval('[data-event="523"]', node => node.textContent), '523');
    } finally { await page.close(); }
});
