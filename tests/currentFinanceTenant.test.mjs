import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';

const owner = { role: 'org_owner', orgs: [{ id: 'our-org', name: 'Our organisation', member_role: 'owner' }] };
const gatewayGrant = {
    role: 'custom',
    allowed_tabs: ['finance'],
    module_permissions: { finance: { allowedTabs: ['transactions'], allowedEvents: [] } },
};
const syntheticSession = { user: { id: 'fixture-user', email: 'owner@example.invalid' } };

const fixtureClient = `
    const events = [{id:14,event_name:'Our event',organisation_id:'our-org',is_manual:true}, {id:15,event_name:'Other event',organisation_id:'other-org',is_manual:true}];
    export const supabase = {
        auth: { async getUser(){ return { data: { user: window.fixture.session.user } }; } },
        async rpc(name, args) {
            window.fixture.calls.push([name, args]);
            if (name === 'organisation_banking') return window.fixture.refuse ? { error: {} } : { data: { saved: false } };
            return { data: !window.fixture.refuse };
        },
        from(table) {
            const matches = {};
            const rows = () => events.filter(row => Object.entries(matches).every(([key,value]) => String(row[key]) === String(value)));
            return {
                select(){ return this; }, eq(key,value){ matches[key]=value; return this; }, order(){ return this; },
                async range(){window.fixture.calls.push([table, {...matches}]); return { data: rows() };},
                async single(){window.fixture.calls.push([table, {...matches}]); return { data: rows()[0] };},
            };
        },
    };
`;
const mocks = {
    supabaseClient: fixtureClient,
    FinanceManager: 'export default props => <output id="platform">{JSON.stringify(props)}</output>',
    EventFinance: 'export default props => <output id="scoped-finance">{JSON.stringify(props)}</output>',
    LicenseManager: 'export default ({navigation}) => <><output id="licences">{navigation.playerId}</output><button id="player-back" onClick={navigation.closePlayer}>Back</button></>',
    OrganisationBankingDetails: 'export default ({organisationId}) => <output id="banking">{organisationId}</output>',
    ManualEventRegistrations: 'export default props => <><output id="event-details">{JSON.stringify(props)}</output><button id="event-back" onClick={props.onBack}>Back</button></>',
};

let browser, script;
before(async () => {
    const bundle = await build({
        stdin: {
            contents: `
                import { createRoot } from 'react-dom/client';
                import { MemoryRouter } from 'react-router-dom';
                import { CurrentFinance, CurrentLicences } from './src/pages/admin-preview/current/CurrentFinance.jsx';
                const { input, session } = window.fixture;
                const Workspace = input.page === 'licenses' ? CurrentLicences : CurrentFinance;
                createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={['/admin-preview/' + input.page + (input.search || '')]}>
                    <Workspace {...input} session={session} />
                </MemoryRouter>);
            `,
            sourcefile: 'current-finance-fixture.jsx', resolveDir: process.cwd(), loader: 'jsx',
        },
        bundle: true, write: false, format: 'iife', jsx: 'automatic',
        plugins: [{
            name: 'synthetic-finance',
            setup(builder) {
                builder.onResolve({ filter: /\/(FinanceManager|EventFinance|LicenseManager|OrganisationBankingDetails|ManualEventRegistrations)\.jsx$|\/supabaseClient$/ },
                    args => ({ path: args.path.split('/').at(-1).replace(/\.jsx$/, ''), namespace: 'finance-fixture' }));
                builder.onLoad({ filter: /.*/, namespace: 'finance-fixture' }, args => ({
                    contents: mocks[args.path], loader: 'jsx', resolveDir: process.cwd(),
                }));
            },
        }],
    });
    script = bundle.outputFiles[0].text;
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
});

after(async () => { await browser?.close(); });

async function withWorkspace(input, run, refuse = false) {
    const page = await browser.newPage();
    page.setDefaultTimeout(7000);
    try {
        await page.setContent('<main id="root"></main>');
        await page.evaluate((input, session, refuse) => { window.fixture = { input, session, refuse, calls: [] }; }, input, syntheticSession, refuse);
        await page.addScriptTag({ content: script });
        await run(page);
    } finally {
        await page.close();
    }
}

async function output(page, selector) {
    await page.waitForSelector(selector);
    return page.$eval(selector, node => node.textContent);
}

const calls = page => page.evaluate(() => window.fixture.calls);

test('organisation reports require a current owner grant and keep the EventFinance scope', async () => {
    const input = { page: 'reports', permissions: owner, scopeId: 'org:our-org', search: '?event=14' };
    await withWorkspace(input, async page => {
        assert.deepEqual(JSON.parse(await output(page, '#scoped-finance')), {
            allowedEvents: [], initialEventId: 14, scopeId: 'org:our-org', requireEventScope: true, allowPlatformActions: false,
        });
        assert.deepEqual(await calls(page), [['is_organisation_admin', { p_organisation_id: 'our-org' }]]);
        assert.equal(await page.$('#platform'), null);
    });
    await withWorkspace(input, async page => {
        assert.match(await output(page, '[role="alert"]'), /could not be verified/);
        assert.equal(await page.$('#scoped-finance'), null);
    }, true);
    await withWorkspace({ ...input, scopeId: 'org:other-org' }, async page => {
        assert.match(await output(page, 'main h1'), /Finance reports/);
        assert.equal(await page.$('#scoped-finance'), null);
        assert.deepEqual(await calls(page), []);
    });
});

test('an event-specific finance delegate receives only their exact assigned IDs', async () => {
    const permissions = { ...gatewayGrant, module_permissions: { finance: { allowedTabs: ['summary'], allowedEvents: [14] } } };
    await withWorkspace({ page: 'reports', permissions, scopeId: 'all', search: '?event=15' }, async page => {
        const props = JSON.parse(await output(page, '#scoped-finance'));
        assert.deepEqual(props.allowedEvents, [14]);
        assert.equal(props.initialEventId, null);
        assert.equal(props.requireEventScope, true);
        assert.equal(props.allowPlatformActions, false);
        assert.equal(await page.$('#platform'), null);
    });
});

test('payout tools verify organisation banking before loading or opening own event finances', async () => {
    const input = { page: 'payouts', permissions: owner, scopeId: 'org:our-org' };
    await withWorkspace(input, async page => {
        assert.equal(await output(page, '#banking'), 'our-org');
        await page.waitForSelector('option[value="14"]');
        assert.equal(await page.$('option[value="15"]'), null);
        assert.deepEqual((await calls(page))[0], ['organisation_banking', { p_action: 'summary', p_org_id: 'our-org', p_data: {} }]);
        await page.select('select', '14');
        await page.$eval('button[type="submit"]', button => button.click());
        const props = JSON.parse(await output(page, '#event-details'));
        assert.equal(props.initialTab, 'statement');
        assert.equal(props.allowPlatformActions, false);
        assert.equal(props.event.organisation_id, 'our-org');
        assert.deepEqual((await calls(page)).at(-1), ['calendar', { organisation_id: 'our-org', is_manual: true, id: '14' }]);
        await page.$eval('#event-back', button => button.click());
        assert.equal(await output(page, '#banking'), 'our-org');
    });
    await withWorkspace(input, async page => {
        assert.match(await output(page, '[role="alert"]'), /could not be verified/);
        assert.deepEqual((await calls(page)).map(([name]) => name), ['organisation_banking']);
        assert.equal(await page.$('#event-details'), null);
    }, true);
});

test('tenant scope cannot open gateway or global licence register through direct routes', async () => {
    const permissions = { ...gatewayGrant, orgs: owner.orgs, allowed_tabs: ['finance', 'licenses'] };
    for (const page of ['payments', 'licenses']) {
        for (const scopeId of ['org:our-org', 'all']) {
            await withWorkspace({ page, permissions, scopeId }, async browserPage => {
                assert.match(await output(browserPage, 'main p'), /Platform .* access is required/);
                assert.deepEqual(await calls(browserPage), []);
                assert.equal(await browserPage.$('#platform, #licences'), null);
            });
        }
    }
    await withWorkspace({ page: 'payments', permissions: gatewayGrant, scopeId: 'all' }, async page => {
        assert.deepEqual(JSON.parse(await output(page, '#platform')), { initialTab: 'transactions', transactionsOnly: true });
    });
});

test('licence deep links mount only after the live licence RPC grant is verified', async () => {
    const input = { page: 'licenses', permissions: { role: 'custom', allowed_tabs: ['licenses'] }, scopeId: 'all', search: '?license_player=42' };
    await withWorkspace(input, async page => {
        assert.equal(await output(page, '#licences'), '42');
        assert.deepEqual(await calls(page), [['can_manage_licenses', null]]);
        await page.$eval('#player-back', button => button.click());
        await page.waitForFunction(() => document.querySelector('#licences')?.textContent === '');
    });
    await withWorkspace(input, async page => {
        assert.match(await output(page, '[role="alert"]'), /could not be verified/);
        assert.equal(await page.$('#licences'), null);
    }, true);
});
