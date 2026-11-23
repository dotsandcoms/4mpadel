import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';
import { resolveEventWorkspace } from '../src/utils/adminCalendarScope.js';

const root = process.cwd();
const temp = await mkdtemp(path.join(tmpdir(), '4m-admin-current-events-'));
const output = path.join(temp, 'fixture.js');
let browser;

const supabase = `
    const own = { id: 523, event_name: 'Quick Open', venue: 'Club', city: 'Cape Town', start_date: '2030-11-20', is_visible: true,
        is_manual: true, is_quick_event: true, sapa_status: 'Bronze', organisation_id: 'org-a' };
    const events = [own, { ...own, id: 524, event_name: 'Other Org Open', organisation_id: 'org-b' }];
    window.__calendarQueries = [];
    export const supabase = { from(table) {
        let rows = table === 'calendar' ? events : [];
        const filters = [];
        const query = { select() { return query; }, order() { return query; },
            in(field, values) { filters.push([field, values]); rows = rows.filter(row => values.includes(row[field])); return query; },
            eq(field, value) { filters.push([field, value]); rows = rows.filter(row => row[field] === value); return query; },
            then(resolve) { window.__calendarQueries.push({ table, filters }); return Promise.resolve({ data: rows, error: null }).then(resolve); } };
        return query;
    } };
`;

const mocks = {
    supabaseClient: supabase,
    useRankedin: 'export const useRankedin = () => ({});',
    recentResults: 'export const promoteFinishedTiersToRecentResults = () => { throw new Error("Global promotion must be skipped for scoped Calendar"); };',
    EventBuilder: 'import React from "react"; export default props => props.isOpen ? <div data-modal="full">{props.editingEvent?.event_name || "New event"}<button onClick={props.onClose}>Close</button></div> : null;',
    QuickEventBuilder: 'import React from "react"; export default props => props.isOpen ? <div data-modal="quick">{props.editingEvent?.event_name || "New quick event"}<button onClick={props.onClose}>Close</button></div> : null;',
    EventFinance: 'import React from "react"; export default props => <output data-event={props.initialEventId} data-tab={props.initialRegistrationTab} data-scope={props.scopeId} data-platform={String(props.allowPlatformActions)}>{props.allowedEvents?.join(",")}</output>;',
    EventMessaging: 'export default () => null;',
    HelpRequestsAdmin: 'export default () => null;',
    PrivateDrawRehearsal: 'export function PrivateRehearsalEvents() { return null; } export default () => null;',
    useHelpUnread: 'export const useHelpUnread = () => { window.__unscopedUnreadHook = true; return { unread: 1 }; };',
};

before(async () => {
    await build({
        stdin: { contents: `import React from 'react'; import { createRoot } from 'react-dom/client';
            import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
            import { CurrentCalendar, CurrentEvents } from './src/pages/admin-preview/current/CurrentEvents.jsx';
            function Fixture() {
                const location = useLocation();
                window.__navigate = useNavigate();
                const props = { session: { user: { id: 'fixture-user', email: 'owner@example.invalid' } }, scopeId: window.__scope, permissions: window.__permissions };
                return <><output data-location={location.search} />{location.pathname.endsWith('/calendar') ? <CurrentCalendar {...props} /> : <CurrentEvents {...props} page="events" />}</>;
            }
            createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={[window.__path]}><Fixture /></MemoryRouter>);`,
            resolveDir: root, loader: 'jsx' },
        outfile: output, bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic',
        define: { 'import.meta.env': '{}' },
        plugins: [{ name: 'events-current-fixture', setup(builder) {
            builder.onResolve({ filter: /\/(supabaseClient|useRankedin|recentResults|EventBuilder|QuickEventBuilder|EventFinance|EventMessaging|HelpRequestsAdmin|PrivateDrawRehearsal|useHelpUnread)$/ }, args => ({ path: args.path.split('/').at(-1), namespace: 'mock' }));
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

const orgOwner = { role: 'org_owner', orgs: [{ id: 'org-a', member_role: 'owner' }] };

test('standalone platform grants survive while assignments and staff do not gain broad access', () => {
    const standalone = { role: 'custom', allowed_tabs: ['calendar', 'event-mgmt'] };
    assert.equal(resolveEventWorkspace(standalone, 'all', 'calendar').allowPlatformActions, true);
    assert.equal(resolveEventWorkspace(standalone, 'all', 'event-mgmt').allowPlatformActions, true);
    const assigned = { ...standalone, module_permissions: { 'event-mgmt': { allowedEvents: [523, true, 'bad'] } } };
    assert.deepEqual(resolveEventWorkspace(assigned, 'all', 'event-mgmt'), {
        scopeId: 'all', allowedEvents: [523], allowPlatformActions: false, requireEventScope: true,
    });
    assert.equal(resolveEventWorkspace({ ...standalone, orgs: [{ id: 'org-a', member_role: 'staff' }] }, 'all', 'calendar'), null);
});

async function open(url, permissions = orgOwner, scopeId = 'all') {
    const page = await browser.newPage();
    page.setDefaultTimeout(6_000);
    await page.setRequestInterception(true);
    page.on('request', request => request.abort());
    await page.setContent('<main id="root"></main>');
    await page.evaluate((url, permissions, scopeId) => { window.__path = url; window.__permissions = permissions; window.__scope = scopeId; }, url, permissions, scopeId);
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
        assert.equal(await page.$eval('[data-event="523"]', node => node.dataset.platform), 'false');
        assert.equal(await page.evaluate(() => Boolean(window.__unscopedUnreadHook)), false);
    } finally { await page.close(); }
});

test('tenant Calendar combines exact membership and assigned IDs and omits platform actions', async () => {
    const permissions = { ...orgOwner, module_permissions: { 'event-mgmt': { allowedEvents: [523, 524] } } };
    const page = await open('/admin-preview/calendar?editEvent=524', permissions);
    try {
        await page.waitForFunction(() => document.body.textContent.includes('Quick Open'));
        assert.equal(await page.evaluate(() => document.body.textContent.includes('Other Org Open')), false);
        assert.equal(await page.$('[data-modal],button[title="Delete Event"],button[title="Force Sync from Rankedin"]'), null);
        assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].some(button => /Sync Past Event Data|Sync Event List|Quick Event|Create Event/.test(button.textContent))), false);
        assert.deepEqual(await page.evaluate(() => window.__calendarQueries), [
            { table: 'calendar', filters: [['organisation_id', 'org-a'], ['id', [523, 524]]] },
            { table: 'event_creation_audit', filters: [['event_id', [523]]] },
        ]);
    } finally { await page.close(); }
});

test('an unowned Calendar scope is denied before a query', async () => {
    const page = await open('/admin-preview/calendar?create=quick', orgOwner, 'org:org-b');
    try {
        await page.waitForSelector('[role="alert"]');
        assert.match(await page.$eval('[role="alert"]', node => node.textContent), /Calendar access is required/);
        assert.deepEqual(await page.evaluate(() => window.__calendarQueries || []), []);
    } finally { await page.close(); }
});
