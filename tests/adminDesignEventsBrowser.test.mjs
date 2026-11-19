import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';

const root = process.cwd();
const fixtureDir = await mkdtemp(path.join(tmpdir(), '4m-design-events-'));
const output = path.join(fixtureDir, 'fixture.js');
let browser;

before(async () => {
    await build({
        stdin: { contents: `
            import React, { useState } from 'react';
            import { createRoot } from 'react-dom/client';
            import { MemoryRouter, useLocation } from 'react-router-dom';
            import EventManagerDashboard from './src/pages/admin-preview/EventManagerDashboard.jsx';
            import EventEntryForm, { EventEntryPaymentLinks } from './src/pages/admin-preview/EventEntryForm.jsx';
            import EventReplacementDialog from './src/pages/admin-preview/EventReplacementDialog.jsx';
            import EventRehearsal from './src/pages/admin-preview/EventRehearsal.jsx';
            import EventGroupDrawDialog from './src/pages/admin-preview/EventGroupDrawDialog.jsx';
            import TournamentWorkspace from './src/pages/admin-preview/tournament/TournamentWorkspace.jsx';
            import CalendarWorkspace from './src/pages/admin-preview/CalendarWorkspace.jsx';
            import EventBuilder from './src/components/admin/EventBuilder.jsx';
            import QuickEventBuilder from './src/components/admin/QuickEventBuilder.jsx';
            import './src/pages/AdminPreview.css';
            const session = { user: { id: 'fixture-user', email: 'owner@example.invalid' } };
            const event = { id: 11, organisation_id: 'org-a', event_name: 'Silver Open', slug: 'silver-open', sapa_status:'Silver', finance_managed:true, is_manual:true, is_visible:true, payment_method:'platform', start_date:'2035-01-21' };
            const bronze = { ...event, id:12, event_name:'Bronze Open', sapa_status:'Bronze' };
            const other = { ...event, id:13, organisation_id:'org-b', event_name:'Other Open' };
            const search = async () => [{ id: 31, name: 'New Player', email:'new@example.invalid' }];
            const registration = { id:'reg-1', full_name:'Previous Player', event_id:11, email:'old@example.invalid', division:'Open' };
            const division = { id: 51, name: 'Open', entry_fee:500, is_active:true };
            const groupRows = [{ id:'ga', name:'Group A' }, { id:'gb', name:'Group B' }].map((group,index)=>({
                ...group,entries:[0,1].map(offset=>({id:'team-'+(index*2+offset+1),team_name:'Team '+(index*2+offset+1),group_id: group.id,seed_number:index*2+offset+1}))
            }));
            const draw = { id:'draw-a', status:'draft', format:'group_only', updated_at:'draw-v1' };
            const groupSnapshot = { draw, groups:groupRows, entries:groupRows.flatMap(row=>row.entries), audit:[], matchSets:[],
                matches:groupRows.map((row, index)=>({id:'match-'+index,group_id:row.id,stage:'group',status:'pending',updated_at:'match-v1',round_number:1,round_label:'Group',round_code:'group',bracket_position:1,entry_one:row.entries[0],entry_two:row.entries[1]})) };

            const tournamentDraw = { ...draw, draw_kind:'main', division_id:51, format:'knockout', status:'published' };
            const booking = { court_name:'Court 1', scheduled_start:'2035-01-21T12:00:00Z', scheduled_end:'2035-01-21T13:00:00Z' };
            const tournamentMatch = { ...booking, id:'match-tm-1', draw_id:draw.id, stage:'knockout', status:'scheduled', updated_at:'match-v1', round_number:1, round_label:'Final', entry_one_id:'tm-1', entry_two_id:'tm-2' };
            const tournament = { event, divisions:[division,{ id:52, name:'Reserved Division', is_active:false }], draws:[tournamentDraw], matches:[tournamentMatch],
                entries:[{id:'tm-1',team_name:'First Pair'},{id:'tm-2',team_name:'Second Pair'}], registrations:[], players:[], sets:[], standings:[],
                playDays:[{play_date:'2035-01-21', start_time:'10:00', end_time:'19:00', courts_count:1, is_active:true}],
                settings:{}, confirmations:[], finalisations:[], audit:[], access:[], capabilities:['draws','schedule','results'],
                sourceFingerprint:'source-fingerprint', schedule:{revision:2, status:'draft', source_fingerprint:'source-fingerprint', assignments:{'match-tm-1':booking}} };
            window.calls = [];
            const verifyAccess = async () => ({ event });
            const client = {
                auth:{ getUser: async () => ({ data:{ user:session.user } }) },
                async rpc(name,args) {
                    window.calls.push([name,args]);
                    if (name==='tm_snapshot') return args.p_event === '11' ? { data: tournament } : { error: { message:'No access to this tournament' } };
                    if (name==='tm_publish_schedule') { tournament.schedule.status = 'published'; return { data:true }; }
                    if (name==='tm_record_result') return { data:true };
                    if (name==='replace_registration_player') return { data:{ registration_id:'reg-1',new_email:'new@example.invalid',new_name:'New Player' } };
                    if (name==='private_draw_rehearsal_snapshot') return { data:{ version:1, owner_id:session.user.id, event } };
                    return { data:0 };
                },
                from(table) {
                    let rows=table==='calendar'?[event,bronze,other]:[];
                    let bounds=null;
                    const query={select(){return query;},order(){return query;},eq(key,value){rows=rows.filter(r=>r[key]===value);return query;},
                        in(key,values){rows=rows.filter(r=>values.includes(r[key]));return query;},
                        range(start,end){bounds=[start,end];return query;},abortSignal(){return query;},
                        then(resolve){return Promise.resolve({data:bounds?rows.slice(bounds[0],bounds[1]+1):rows}).then(resolve);} };
                    return query;
                }
            };
            function Editor({ onClose }) {
                return <section role="dialog" aria-label="Synthetic quick event editor"><button onClick={()=>onClose({refresh:false})}>Close quick editor</button></section>;
            }
            function CalendarFixture() {
              const route=useLocation();
              return <><output data-query={route.search} /><CalendarWorkspace session={session} client={client}
                scope={{id:'org:org-a'}} permissions={{role:'org_owner',orgs:[{id:'org-a',member_role:'owner'}]}}
                scopeId="org:org-a" canManageEvents QuickCreationDialog={Editor} /></>;
            }
            function Fixture({ kind }) {
                const [added,setAdded]=useState(null);
                if (kind.startsWith('tournament-')) {
                    const route = { 'tournament-draw':'?event=11&workspace=draws&division=52', 'tournament-other':'?event=13&workspace=results',
                        'tournament-schedule':'?event=11&workspace=schedule', 'tournament-result':'?event=11&workspace=results' }[kind];
                    return <MemoryRouter initialEntries={['/admin-preview/tournaments'+route]}><TournamentWorkspace client={client} session={session} scopeId="all" /></MemoryRouter>;
                }
                if (kind==='calendar') return <MemoryRouter initialEntries={['/?create=quick&keep=1']}><CalendarFixture /></MemoryRouter>;
                if (kind==='dashboard') return <EventManagerDashboard events={[event,bronze,other]} registrations={[]} go={()=>{}} client={client} canReadSnapshots session={session} />;
                if (kind==='replace') return <EventReplacementDialog client={client} session={session} scopeId="org:org-a" event={event} team={[registration]} search={search} verifyAccess={verifyAccess} onClose={()=>window.calls.push(['closed'])}/>;
                if (kind==='group') return <EventGroupDrawDialog client={client} session={session} scopeId="org:org-a" event={event} division={division}
                    draw={draw} load={async ()=>groupSnapshot} verifyAccess={verifyAccess} onClose={()=>window.calls.push(['closed'])}/>;
                if (kind==='rehearsal') return <EventRehearsal client={client} session={session} event={event} onClose={()=>window.calls.push(['closed'])}/>;
                if (kind==='full-builder') return <EventBuilder isOpen theme="preview" onClose={()=>{}} beforeSave={async context=>{window.calls.push([context.operation]);return false;}}/>;
                if (kind==='quick-builder') return <QuickEventBuilder isOpen theme="preview" onClose={()=>{}} beforeSave={async context=>{window.calls.push([context.operation]);return false;}}/>;
                return added ? <EventEntryPaymentLinks links={added.links} /> : <EventEntryForm event={event} divisions={[division]} search={search}
                    save={async draft=>{window.calls.push(['entry',draft]);return{registrations:[{id:'reg-new',pay_token:'fake-token'}]};}} onReview={setAdded}/>;
            }
            const root=createRoot(document.getElementById('root'));
            window.show=kind=>root.render(<Fixture key={kind} kind={kind}/>);
        `, loader: 'jsx', resolveDir: root },
        bundle: true, jsx: 'automatic', platform: 'browser', format: 'iife', outfile: output,
        define: { 'import.meta.env': '{}' },
        plugins: [{ name: 'fixture-connectors', setup(builder) {
            builder.onResolve({ filter: /\/supabaseClient(?:\.js)?$/ }, () => ({ path: 'client', namespace: 'fixture' }));
            builder.onResolve({ filter: /\/eventSnapshots(?:\.js)?$/ }, () => ({ path: 'snapshots', namespace: 'fixture' }));
            builder.onResolve({ filter: /\/useClubs(?:\.js)?$/ }, () => ({ path: 'clubs', namespace: 'fixture' }));
            builder.onResolve({ filter: /\/useAdminPermissions(?:\.js)?$/ }, () => ({ path: 'permissions', namespace: 'fixture' }));
            builder.onResolve({ filter: /\/googleMaps(?:\.js)?$/ }, () => ({ path: 'maps', namespace: 'fixture' }));
            builder.onResolve({ filter: /\/(?:AdvancedEventDetailsDialog|CreateEventDialog|CreateQuickEventDialog|QuickEventDetailsDialog)(?:\.jsx)?$/ }, () => ({ path: 'editor', namespace: 'fixture' }));
            builder.onLoad({ filter: /./, namespace: 'fixture' }, args => ({ contents: {
                client: `export const supabase={auth:{getUser:async()=>({data:{user:{id:'fixture-user',email:'owner@example.invalid'}}})},
                    from(){const query={select(){return query},eq(){return query},in(){return query},order(){return query},limit(){return query},
                        maybeSingle(){return Promise.resolve({data:null})},then(resolve){return Promise.resolve({data:[]}).then(resolve)}};return query}};
                    export const isSupabaseConfigured=()=>false;`,
                snapshots: 'export const loadEventSnapshots=async()=>({});',
                clubs: 'const clubs=[]; export const useClubs=()=>({clubs,loading:false});',
                permissions: 'const permissions={role:"super_admin"}; export const useAdminPermissions=()=>({permissions});',
                maps: 'export const loadGoogleMaps=async()=>null; export const attachPlacesAutocomplete=async()=>()=>{};',
                editor: 'export default ()=>null;',
            }[args.path] }));
        } }],
    });
    browser = await puppeteer.launch({ headless: true, protocolTimeout: 20000, args: ['--no-sandbox'] });
});

after(async () => {
    await browser?.close();
    await rm(fixtureDir, { recursive: true, force: true });
});

async function open(kind) {
    const page = await browser.newPage();
    page.on('pageerror', error => console.error(kind, error.message));
    page.setDefaultTimeout(7500);
    await page.setRequestInterception(true);
    page.on('request', request => {
        if (request.url() === 'http://fixture.invalid/') return request.respond({ contentType: 'text/html', body: '<main id="root"></main>' });
        if (request.url() === 'http://fixture.invalid/private-draw-rehearsal/index.html') {
            return request.respond({ contentType: 'text/html', body: '<main>Isolated fixture</main>' });
        }
        return request.abort();
    });
    await page.goto('http://fixture.invalid/');
    await page.addStyleTag({ path: path.join(fixtureDir, 'fixture.css') });
    await page.addScriptTag({ path: output });
    await page.evaluate(kind => window.show(kind), kind);
    return page;
}

async function clickText(page, label, selector = 'button') {
    await page.waitForFunction((label, selector) => [...document.querySelectorAll(selector)].some(node => node.textContent.trim() === label), {}, label, selector);
    await page.evaluate((label, selector) => [...document.querySelectorAll(selector)].find(node => node.textContent.trim() === label).click(), label, selector);
}

test('the Bronze switch updates the original event list', async () => {
    const dashboard = await open('dashboard');
    try {
        await dashboard.waitForFunction(() => document.body.textContent.includes('Silver Open'));
        assert.equal(await dashboard.evaluate(() => document.body.textContent.includes('Bronze Open')), false);
        await dashboard.$eval('[role=switch]', button => button.click());
        await dashboard.waitForFunction(() => document.body.textContent.includes('Bronze Open'));
    } finally { await dashboard.close(); }
});

test('scoped Calendar opens its quick modal and consumes the create command', async () => {
    const calendar = await open('calendar');
    try {
        await calendar.waitForSelector('[aria-label="Synthetic quick event editor"]');
        await calendar.waitForSelector('[data-query="?keep=1"]');
        await clickText(calendar, 'Close quick editor');
        assert.equal(await calendar.$('[aria-label="Synthetic quick event editor"]'), null);
        await calendar.waitForFunction(() => document.body.textContent.includes('Silver Open'));
        assert.equal(await calendar.evaluate(() => document.body.textContent.includes('Other Open')), false);
    } finally { await calendar.close(); }
});

test('staff entry review saves pending and returns the existing payment link', async () => {
    const entry = await open('entry');
    try {
        await entry.type('.ap-event-player-search input', 'New');
        await entry.waitForSelector('[aria-label="Matching players"] button');
        await entry.$eval('[aria-label="Matching players"] button', button => button.click());
        await entry.$eval('.ap-select-trigger', button => button.click());
        await clickText(entry, 'Open · R 500,00', '[role=option]');
        await clickText(entry, 'Review player (pending)');
        assert.equal(await entry.evaluate(() => window.calls.length), 0);
        await clickText(entry, 'Confirm and add pending');
        await entry.waitForSelector('a[href$="pay_token=fake-token"]');
        assert.equal(await entry.evaluate(() => window.calls.length), 1);
    } finally { await entry.close(); }
});

test('player substitution requires a confirmed replacement selection', async () => {
    const replace = await open('replace');
    try {
        await replace.type('.ap-event-player-search input', 'New');
        await replace.waitForSelector('[aria-label="Matching players"] button');
        await replace.$eval('[aria-label="Matching players"] button', button => button.click());
        assert.equal(await replace.evaluate(() => window.calls.length), 0);
        await clickText(replace, 'Confirm replacement');
        await replace.waitForFunction(() => document.querySelector('[role=status]')?.textContent.includes('taken over'));
        assert.equal(await replace.evaluate(() => window.calls[0][0]), 'replace_registration_player');
    } finally { await replace.close(); }
});

test('group moves save a versioned fixture after review', async () => {
    const group = await open('group');
    try {
        await group.waitForSelector('.ap-select-trigger');
        await group.$eval('.ap-select-trigger', button => button.click());
        await clickText(group, 'Group A · Team 1', '[role=option]');
        await group.evaluate(() => [...document.querySelectorAll('.ap-select-trigger')].at(1).click());
        await clickText(group, 'Group B · Swap with Team 3', '[role=option]');
        await clickText(group, 'Review group change');
        assert.equal(await group.evaluate(() => window.calls.length), 0);
        await clickText(group, 'Confirm');
        await group.waitForFunction(() => document.querySelector('[role=status]')?.textContent.includes('updated'));
        assert.equal(await group.evaluate(() => window.calls[0][1].p_expected), 'draw-v1');
    } finally { await group.close(); }
});

test('a fresh rehearsal stays in its sandbox before leaving', async () => {
    const rehearsal = await open('rehearsal');
    try {
        await rehearsal.waitForSelector('iframe[sandbox="allow-scripts allow-downloads"]');
        await clickText(rehearsal, 'Start fresh copy');
        await clickText(rehearsal, 'Replace private copy');
        await rehearsal.waitForFunction(() => window.calls.filter(call => call[0] === 'private_draw_rehearsal_snapshot').length === 2);
        await clickText(rehearsal, 'Leave rehearsal');
        assert.deepEqual(await rehearsal.evaluate(() => window.calls.map(call => call[0])), ['private_draw_rehearsal_snapshot', 'private_draw_rehearsal_snapshot', 'closed']);
    } finally { await rehearsal.close(); }
});

test('full and quick creation mount the original light event-builder mode', async () => {
    for (const kind of ['full-builder', 'quick-builder']) {
        const page = await open(kind);
        try {
            await page.waitForSelector('.ap-live-event-editor');
            assert.equal(await page.evaluate(() => window.calls.length), 0);
        } finally { await page.close(); }
    }
});

test('verified Tournament deep link selects the requested division and denies an unassigned event', async () => {
    const assigned = await open('tournament-draw');
    try {
        await assigned.waitForSelector('.tm-division-choice[aria-pressed=true]');
        assert.match(await assigned.$eval('.tm-division-choice[aria-pressed=true]', button => button.textContent), /Reserved Division/);
        assert.equal(await assigned.$eval('.tm-tabs [aria-current=page]', link => link.textContent), 'Draws');
        assert.deepEqual(await assigned.evaluate(() => window.calls), [['tm_snapshot', { p_event: '11' }]]);
    } finally { await assigned.close(); }
    const unassigned = await open('tournament-other');
    try {
        await unassigned.waitForFunction(() => document.querySelector('[role=alert]')?.textContent.includes('No access'));
        assert.equal(await unassigned.$('.tm-tabs'), null);
        assert.deepEqual(await unassigned.evaluate(() => window.calls), [['tm_snapshot', { p_event: '13' }]]);
    } finally { await unassigned.close(); }
});

test('the original Tournament schedule publishes only the reviewed revision for its event', async () => {
    const page = await open('tournament-schedule');
    try {
        await page.waitForSelector('.tm-match-card');
        const cancel = dialog => dialog.dismiss();
        page.once('dialog', cancel);
        await clickText(page, 'Publish schedule');
        assert.equal(await page.evaluate(() => window.calls.some(call => call[0] === 'tm_publish_schedule')), false);
        page.once('dialog', dialog => dialog.accept());
        await clickText(page, 'Publish schedule');
        await page.waitForFunction(() => document.body.textContent.includes('Schedule published to the public court calendar'));
        assert.deepEqual(await page.evaluate(() => window.calls.find(call => call[0] === 'tm_publish_schedule')), ['tm_publish_schedule', { p_event: 11, p_expected: 2 }]);
    } finally { await page.close(); }
});

test('the original Tournament Results drawer saves an explicitly entered score to the scoped fixture', async () => {
    const page = await open('tournament-result');
    try {
        await clickText(page, 'Enter result');
        await page.waitForSelector('dialog[open]');
        await page.evaluate(() => [...document.querySelectorAll('dialog label')].find(label => label.textContent.startsWith('Winner')).querySelector('button').click());
        await clickText(page, 'First Pair', '[role=option]');
        await page.type('dialog input[type=number]:nth-of-type(1)', '6');
        const scoreFields = await page.$$('dialog input[type=number]');
        await scoreFields[1].type('4');
        assert.equal(await page.evaluate(() => window.calls.some(call => call[0] === 'tm_record_result')), false);
        await clickText(page, 'Save result');
        await page.waitForFunction(() => document.body.textContent.includes('Result saved'));
        assert.deepEqual(await page.evaluate(() => window.calls.find(call => call[0] === 'tm_record_result')), ['tm_record_result', { p_event: 11, p_match: 'match-tm-1', p_expected: 'match-v1', p_result: {kind:'played',winner:'tm-1',reason:'',sets:[[6,4]]} }]);
    } finally { await page.close(); }
});
