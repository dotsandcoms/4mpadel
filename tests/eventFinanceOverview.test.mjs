import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';

const root = process.cwd();
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), '4m-finance-overview-'));
const output = path.join(temporary, 'fixture.js');
const eventName = 'The Johannesburg Open - CHANGAN SA GRAND TOUR';
let browser;

// The first 1,000 active registrations include only 24 Johannesburg entries.
// The real screen must also load the remaining 76, including pending entries.
const mockSupabase = `
import {buildFinanceOverviewSummaries} from './src/utils/eventFinanceSummary.js';
const pad = n => String(n).padStart(4, '0');
const older = Array.from({length:976}, (_,i) => ({
 id:'r'+pad(i+1), event_id:520, email:'older'+i+'@example.com', division:'Open',
 payment_status:'paid', status:'registered', tournament_divisions:{entry_fee:600}
}));
const target = Array.from({length:100}, (_,i) => ({
 id:'r'+pad(i+977), event_id:521, email:'player'+i+'@example.com', division:'Open',
 payment_status:i<87?'paid':'pending', status:'registered', tournament_divisions:{entry_fee:600}
}));
const players = target.map((r,i)=>({id:i+1,email:r.email,license_type:'none'}));
const tables = {
 calendar:[
  {id:520,event_name:'Earlier event',sapa_status:'Silver',start_date:'2026-10-01',is_manual:true,finance_managed:true},
  {id:521,event_name:${JSON.stringify(eventName)},sapa_status:'Major',start_date:'2026-10-30',is_manual:true,finance_managed:true},
  {id:522,event_name:'RankedIn event',sapa_status:'Gold',start_date:'2026-11-01',entry_fee:100,finance_managed:true,rankedin_id:123},
  {id:523,event_name:'Bronze tournament',sapa_status:'Bronze',start_date:'2026-11-20',is_manual:true,finance_managed:true},
  {id:524,event_name:'Super Gold tournament',sapa_status:'Super Gold',start_date:'2026-11-21',is_manual:true,finance_managed:true},
  {id:525,event_name:'Legacy Super Gold',sapa_status:'S Gold',start_date:'2026-11-22',is_manual:true,finance_managed:true},
  {id:526,event_name:'Social tournament',sapa_status:'None',start_date:'2026-11-23',is_manual:true,finance_managed:true},
  {id:527,event_name:'Unmanaged Gold',sapa_status:'Gold',start_date:'2026-11-24',is_manual:true,finance_managed:false}
 ],
 event_registrations:[...older,...target,{...target[0],id:'r1077',status:'withdrawn'},{...target[1],id:'r1078',payment_status:'pending'},
  {id:'bronze',event_id:523,email:'bronze@example.com',division:'Open',payment_status:'paid',status:'registered',tournament_divisions:{entry_fee:200}}],
 payments:[
  ...Array.from({length:1000},(_,i)=>({id:'p'+pad(i+1),event_id:520,status:'success',amount:i<975?600:0,payment_type:'event_entry_fee',payment_method:'paystack',reference:'OLD-'+i,metadata:{registration_id:older[i+1]?.id}})),
  ...target.slice(0,87).map((r,i)=>({id:'p'+pad(1002+i),event_id:521,status:'success',amount:600,payment_type:'event_entry_fee',payment_method:'paystack',reference:'TARGET-'+i,metadata:{registration_id:r.id,email:r.email}})),
  {id:'p1001',event_id:520,status:'success',metadata:{registration_id:older[0].id,free_entry:true}},
  {id:'bronze-payment',event_id:523,status:'success',amount:200,payment_type:'event_entry_fee',payment_method:'paystack',reference:'BRONZE',metadata:{registration_id:'bronze',email:'bronze@example.com'}}
 ],
 tournament_participants:Array.from({length:1001},(_,i)=>({
  id:i+1,event_id:522,class_name:'Open',full_name:'RankedIn player '+i,is_paid:i<1000
 })),
 players:[...players,{id:10001,email:'bronze@example.com',license_type:'none'}], temporary_licenses:[], event_management_completion:window.__completedEvent?[{event_id:window.__completedEvent,completed_at:'2026-11-01T10:00:00Z'}]:[]
};
window.__queries=[];window.__summaryCalls=[];window.__licenseEvents=[];
window.__recordPayment=()=>{ target[87].payment_status='paid'; tables.payments.push({id:'p2088',event_id:521,status:'success',amount:600,payment_type:'event_entry_fee',payment_method:'paystack',reference:'NEW-87',metadata:{registration_id:target[87].id,email:target[87].email}}); };
export const supabase = {
 auth:{getSession:async()=>({data:{session:{user:{id:window.__userId||'admin'}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
 functions:{invoke:async(name,{body})=>{
  window.__summaryCalls.push(body.event_ids);
  if(window.__holdSummaries)await new Promise(resolve=>{window.__releaseSummaries=resolve});
  if(window.__failure)return {data:{error:'Later '+window.__failure+' page failed'}};
  const ids=body.event_ids;
  const licenses=tables.event_registrations.filter(r=>ids.includes(r.event_id)).map(r=>{
   const player=tables.players.find(p=>p.email===r.email);
   return {event_id:r.event_id,identity:r.email.trim().toLowerCase(),eligibility:player?{full:player.id<=60,temporary:player.id>60&&player.id<=90}:null};
  });
  return {data:{summaries:buildFinanceOverviewSummaries({events:tables.calendar.filter(e=>ids.includes(e.id)),
   registrations:tables.event_registrations.filter(r=>ids.includes(r.event_id)),participants:tables.tournament_participants.filter(r=>ids.includes(r.event_id)),
   payments:tables.payments.filter(r=>ids.includes(r.event_id)),refunds:[],divisions:[],licenses})}};
 }},
 from(table) {
  const filters=[]; const constraints=[]; let ordering=null;
  function execute(from=0,to=999) {
   window.__queries.push({table,from,to,ordering,constraints});
   if(window.__failure===table && from>=500) return {data:null,error:{message:'Later '+table+' page failed'}};
   let rows=(tables[table]||[]).filter(row=>filters.every(filter=>filter(row)));
   if(ordering) rows=[...rows].sort((a,b)=>a[ordering]<b[ordering]?-1:a[ordering]>b[ordering]?1:0);
   return {data:rows.slice(from,to+1),error:null};
  }
  const q={
   select(){return q},
   order(column){ordering=column;return q},
   eq(column,value){constraints.push({column,values:[value]});filters.push(row=>row[column]===value);return q},
   neq(column,value){filters.push(row=>row[column]!==value);return q},
   in(column,values){constraints.push({column,values});filters.push(row=>values.includes(row[column]));return q},
   is(column,value){filters.push(row=>row[column]===value);return q},
   or(filter){const emails=filter.split(',').map(part=>part.replace('email.ilike.',''));constraints.push({column:'email',values:emails});filters.push(row=>emails.includes(row.email));return q},
   async range(from,to){const result=execute(from,to);if(table==='calendar'&&(window.__holdCalendar||(window.__holdBronze&&constraints.some(c=>c.column==='sapa_status'&&c.values.includes('Bronze')))))await new Promise(resolve=>{window.__releaseBronze=resolve;window.__releaseCalendar=resolve});return result},
   async maybeSingle(){const result=execute();return {...result,data:result.data?.[0]||null}},
   then(resolve,reject){return Promise.resolve(execute()).then(resolve,reject)}
  };
  return q;
 }
};`;

before(async () => {
    await build({
        stdin: {
            contents: "import React from 'react';import {createRoot} from 'react-dom/client';import EventFinance from './src/components/admin/EventFinance.jsx';const root=createRoot(document.getElementById('root'));window.__renderOverview=props=>root.render(<EventFinance {...props}/>);window.__hideOverview=()=>root.render(null);window.__renderOverview({isEventManagementModule:true,onStartRehearsal:id=>{window.__rehearsalEvent=id}});",
            resolveDir: root,
            loader: 'jsx',
        },
        outfile: output,
        bundle: true,
        platform: 'browser',
        format: 'iife',
        define: { 'process.env.NODE_ENV': '"test"' },
        plugins: [{ name: 'overview-fixture', setup(builder) {
            builder.onResolve({ filter: /supabaseClient$/ }, () => ({ path: 'supabase', namespace: 'mock' }));
            builder.onResolve({ filter: /useRankedin$/ }, () => ({ path: 'rankedin', namespace: 'mock' }));
            builder.onResolve({ filter: /\/utils\/licenses$/ }, () => ({ path: 'licenses', namespace: 'mock' }));
            builder.onResolve({ filter: /^\.\/(ManualEventRegistrations|EventBuilder)$/ }, args => ({ path: args.path, namespace: 'mock' }));
            builder.onLoad({ filter: /./, namespace: 'mock' }, args => ({ contents: {
                supabase: mockSupabase,
                rankedin: 'export const useRankedin=()=>({getTournamentPlayerTabs:async()=>[]});',
                licenses: `export const hydrateEventLicenses=async(players,eventId)=>{if(players.length)window.__licenseEvents.push(eventId);return players.map(p=>({...p,event_license:{event_id:Number(eventId),full:p.id<=60,temporary:p.id>60&&p.id<=90}}));};`,
                './ManualEventRegistrations': 'import React from "react";export default function Manager({onBack}){return <button onClick={onBack}>Back to events</button>}',
                './EventBuilder': 'export default function Builder(){return null}',
            }[args.path], loader: 'jsx', resolveDir: root }));
        } }],
        loader: { '.png': 'dataurl' },
    });
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
});

after(async () => {
    await browser?.close();
    fs.rmSync(temporary, { recursive: true, force: true });
});

async function openOverview(failure = null, options = {}) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1000 });
    await page.setContent('<!doctype html><html><body><div id="root"></div></body></html>');
    await page.evaluate((value, options) => { window.__failure = value; Object.assign(window, options); }, failure, options);
    await page.addScriptTag({ path: output });
    if (options.__holdSummaries) await page.waitForFunction(() => typeof window.__releaseSummaries === 'function');
    else await page.waitForFunction(() => !!document.querySelector('[data-summary-state="ready"],[data-summary-state="error"],[role="alert"]'));
    return page;
}

async function eventRow(page, name) {
    return page.$$eval('tbody tr', (rows, name) => {
        const row = rows.find(row => row.cells[1]?.textContent.trim() === name);
        if (!row) return null;
        return {
            entries: row.cells[5].querySelector('span').textContent,
            paid: row.cells[5].querySelectorAll('span')[1].textContent.trim(),
            finances: row.cells[6].querySelector('span').textContent.replace(/\s/g,''),
            licenses: [...row.cells[7].querySelectorAll(':scope > div > div')].map(div => div.firstElementChild.textContent),
        };
    }, name);
}

test('overview counts all entries, payments and licenses beyond 1,000 rows, and refreshes after managing an event', async () => {
    const page = await openOverview();
    try {
        assert.deepEqual(await eventRow(page, eventName), {
            entries: '100', paid: '87 Paid', finances: 'R52200,00/R60000,00', licenses: ['60', '30', '10'],
        });
        assert.equal((await eventRow(page, 'Earlier event')).paid, '975 Paid');
        assert.equal((await eventRow(page, 'RankedIn event')).entries, '1001');
        assert.equal(await page.evaluate(() => window.__queries.some(q => ['event_registrations','payments','tournament_participants','payment_refunds','players'].includes(q.table))), false);
        assert.deepEqual(await page.evaluate(() => window.__summaryCalls), [[524,525,522,521,520]]);

        await page.click(`button[aria-label="Manage registrations for ${eventName}"]`);
        await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === 'Back to events'));
        await page.evaluate(() => {
            window.__recordPayment();
            [...document.querySelectorAll('button')].find(b => b.textContent === 'Back to events').click();
        });
        await page.waitForSelector('[data-summary-state="ready"]');
        assert.deepEqual(await eventRow(page, eventName), {
            entries: '100', paid: '88 Paid', finances: 'R52800,00/R60000,00', licenses: ['60', '30', '10'],
        });
    } finally {
        await page.close();
    }
});

for (const table of ['event_registrations', 'payments', 'tournament_participants']) {
    test(`a failed ${table} summary retains event access without displaying partial totals`, async () => {
        const page = await openOverview(table);
        try {
            assert.match(await page.$eval('[role="alert"]', alert => alert.textContent), new RegExp(`Later ${table} page failed`));
            assert.equal((await eventRow(page, eventName)).finances, 'Unavailable');
            await page.evaluate(() => {
                window.__failure = null;
                document.querySelector('[role="alert"] button').click();
            });
            await page.waitForSelector('[data-summary-state="ready"]');
            assert.equal((await eventRow(page, eventName)).paid, '87 Paid');
        } finally {
            await page.close();
        }
    });
}


test('a failed refresh hides stale financial figures until a successful reload', async () => {
    const page = await openOverview();
    try {
        await page.click(`button[aria-label="Manage registrations for ${eventName}"]`);
        await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === 'Back to events'));
        await page.evaluate(() => { window.__failure = 'payments'; [...document.querySelectorAll('button')].find(b => b.textContent === 'Back to events').click(); });
        await page.waitForSelector('[role="alert"]');
        assert.equal((await eventRow(page, eventName)).finances, 'Unavailable');
    } finally { await page.close(); }
});

test('manager defaults to the four SAPA tiers and loads only their data', async () => {
    const page = await openOverview();
    try {
        assert.equal(await eventRow(page, 'Bronze tournament'), null);
        assert.equal(await eventRow(page, 'Social tournament'), null);
        assert.equal(await eventRow(page, 'Unmanaged Gold'), null);
        assert.ok(await eventRow(page, 'Super Gold tournament'));
        assert.ok(await eventRow(page, 'Legacy Super Gold'));
        assert.equal(await page.$eval('[role="switch"]', input => input.checked), false);
        const queries = await page.evaluate(() => window.__queries);
        assert.deepEqual(queries.map(query=>query.table), ['calendar','event_management_completion']);
        assert.deepEqual(await page.evaluate(()=>window.__summaryCalls.flat().sort((a,b)=>a-b)), [520,521,522,524,525]);
    } finally { await page.close(); }
});

test('Bronze switch supports the keyboard and includes Bronze totals without removing the default tiers', async () => {
    const page = await openOverview();
    try {
        const assets = path.join(root, 'dist/assets');
        const css = fs.existsSync(assets) ? fs.readdirSync(assets).find(name => /^index-.*\.css$/.test(name)) : null;
        if (css) await page.addStyleTag({ path: path.join(assets, css) });
        await page.focus('[role="switch"]');
        await page.keyboard.press('Space');
        await page.waitForFunction(() => document.body.textContent.includes('6 system events tracked') && document.querySelector('[data-summary-state="ready"]'));
        assert.deepEqual(await eventRow(page, 'Bronze tournament'), {
            entries: '1', paid: '1 Paid', finances: 'R200,00/R200,00', licenses: ['0', '0', '1'],
        });
        assert.ok(await eventRow(page, eventName));
        assert.equal(await eventRow(page, 'Social tournament'), null);
        assert.equal(await page.$eval('[role="switch"]', input => input.checked), true);
        await page.screenshot({ path: '/tmp/4m-event-manager-bronze-desktop.png', fullPage: true });
        await page.setViewport({ width: 390, height: 844 });
        await page.screenshot({ path: '/tmp/4m-event-manager-bronze-mobile.png', fullPage: true });
        assert.ok(await page.$eval('[role="switch"]', input => {
            const rect = input.closest('label').getBoundingClientRect();
            return rect.left >= 0 && rect.right <= innerWidth;
        }));
        await page.focus('[role="switch"]');
        await page.keyboard.press('Space');
        await page.waitForSelector('[data-summary-state="ready"]');
        assert.equal(await eventRow(page, 'Bronze tournament'), null);
    } finally { await page.close(); }
});

test('an older Bronze request cannot overwrite a newer default view', async () => {
    const page = await openOverview();
    try {
        await page.evaluate(() => { window.__holdBronze = true; });
        await page.focus('[role="switch"]');
        await page.keyboard.press('Space');
        await page.waitForFunction(() => typeof window.__releaseBronze === 'function');
        await page.keyboard.press('Space');
        await page.waitForSelector('[data-summary-state="ready"]');
        await page.evaluate(() => window.__releaseBronze());
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert.equal(await page.$eval('[role="switch"]', input => input.checked), false);
        assert.equal(await eventRow(page, 'Bronze tournament'), null);
        assert.match(await page.$eval('h3 + p', paragraph => paragraph.textContent), /5 system events tracked/);
    } finally { await page.close(); }
});

test('finance views outside Event Manager retain the full event list', async () => {
    const page = await openOverview();
    try {
        await page.evaluate(() => window.__renderOverview({}));
        await page.waitForFunction(() => document.body.textContent.includes('8 system events tracked') && document.querySelector('[data-summary-state="ready"]'));
        assert.equal(await page.$('[role="switch"]'), null);
        for (const name of ['Bronze tournament', 'Social tournament', 'Unmanaged Gold']) assert.ok(await eventRow(page, name));
    } finally { await page.close(); }
});

test('the player directory loads on demand for sync and is reused for subsequent syncs', async () => {
    const page = await openOverview();
    try {
        page.on('dialog', dialog => dialog.accept());
        const sync = () => page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Bulk Sync All').click());
        const directoryReads = () => page.evaluate(() => window.__queries.filter(query => query.table === 'players' && query.constraints.length === 0).length);
        assert.equal(await directoryReads(), 0);
        await sync();
        await page.waitForFunction(() => window.__queries.some(query => query.table === 'players' && query.constraints.length === 0));
        await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Bulk Sync All' && !button.disabled));
        assert.equal(await directoryReads(), 1);
        await sync();
        await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Bulk Sync All' && !button.disabled));
        assert.equal(await directoryReads(), 1);
    } finally { await page.close(); }
});

test('events and actions render before summaries finish, with unknown figures shown as placeholders', async () => {
    const page = await openOverview(null, { __holdSummaries: true });
    try {
        assert.ok(await page.$('progress[aria-label="Event totals loading"]'));
        assert.equal(await page.$eval('progress', progress => progress.value), 0);
        assert.match(await page.$eval('[role="status"]', panel => panel.textContent), /Loading event totals/);
        assert.equal((await eventRow(page, eventName)).entries, '—');
        assert.equal((await eventRow(page, eventName)).finances, 'Loading…');
        assert.equal(await page.$eval(`button[aria-label="Manage registrations for ${eventName}"]`, button => button.disabled), false);
        assert.equal(await page.evaluate(() => window.__queries.some(query => ['payments','players','event_registrations','payment_refunds'].includes(query.table))), false);
        await page.evaluate(() => { window.__holdSummaries = false; window.__releaseSummaries(); });
        await page.waitForSelector('[data-summary-state="ready"]');
        assert.equal((await eventRow(page, eventName)).entries, '100');
        assert.equal(await page.$('progress[aria-label="Event totals loading"]'), null);
    } finally { await page.close(); }
});

test('completed-event summaries are requested when the section is expanded', async () => {
    const page = await openOverview(null, { __completedEvent: 525 });
    try {
        assert.equal(await eventRow(page, 'Legacy Super Gold'), null);
        assert.equal(await page.evaluate(() => window.__summaryCalls.flat().includes(525)), false);
        await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.includes('Completed Events')).click());
        await page.waitForSelector('[data-summary-state="ready"]');
        assert.ok(await eventRow(page, 'Legacy Super Gold'));
        assert.equal(await page.evaluate(() => window.__summaryCalls.at(-1).includes(525)), true);
    } finally { await page.close(); }
});

test('remount restores cached rows and totals while metadata refreshes, without sharing them with another account', async () => {
    const page = await openOverview();
    try {
        await page.evaluate(() => window.__hideOverview());
        await page.waitForFunction(() => !document.querySelector('h3'));
        await page.evaluate(() => { window.__holdCalendar = true; window.__renderOverview({isEventManagementModule:true}); });
        await page.waitForFunction(() => typeof window.__releaseCalendar === 'function');
        assert.equal((await eventRow(page, eventName)).entries, '100');
        await page.evaluate(() => { window.__holdCalendar = false; window.__releaseCalendar(); });
        await page.waitForSelector('[data-summary-state="ready"]');
        await page.evaluate(() => window.__hideOverview());
        await page.waitForFunction(() => !document.querySelector('h3'));
        await page.evaluate(() => {
            window.__userId = 'another-account'; window.__holdCalendar = true; window.__releaseCalendar = null;
            window.__renderOverview({isEventManagementModule:true});
        });
        await page.waitForFunction(() => typeof window.__releaseCalendar === 'function');
        assert.equal(await eventRow(page, eventName), null);
        await page.evaluate(() => { window.__holdCalendar = false; window.__releaseCalendar(); });
        await page.waitForSelector('[data-summary-state="ready"]');
    } finally { await page.close(); }
});
