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
const pad = n => String(n).padStart(4, '0');
const older = Array.from({length:976}, (_,i) => ({
 id:'r'+pad(i+1), event_id:520, email:'older@example.com', division:'Open',
 payment_status:'paid', status:'registered', tournament_divisions:{entry_fee:600}
}));
const target = Array.from({length:100}, (_,i) => ({
 id:'r'+pad(i+977), event_id:521, email:'player'+i+'@example.com', division:'Open',
 payment_status:i<87?'paid':'pending', status:'registered', tournament_divisions:{entry_fee:600}
}));
const players = target.map((r,i)=>({id:i+1,email:r.email,license_type:'none'}));
const tables = {
 calendar:[
  {id:520,event_name:'Earlier event',start_date:'2026-10-01',is_manual:true,finance_managed:true},
  {id:521,event_name:${JSON.stringify(eventName)},start_date:'2026-10-30',is_manual:true,finance_managed:true},
  {id:522,event_name:'RankedIn event',start_date:'2026-11-01',entry_fee:100,finance_managed:true}
 ],
 event_registrations:[...older,...target,{...target[0],id:'r1077',status:'withdrawn'}],
 payments:[
  ...Array.from({length:1000},(_,i)=>({id:'p'+pad(i+1),event_id:520,status:'success',metadata:{}})),
  {id:'p1001',event_id:520,status:'success',metadata:{registration_id:older[0].id,free_entry:true}}
 ],
 tournament_participants:Array.from({length:1001},(_,i)=>({
  id:i+1,event_id:522,class_name:'Open',full_name:'RankedIn player '+i,is_paid:i<1000
 })),
 players, temporary_licenses:[], event_management_completion:[]
};
window.__queries=[];
window.__recordPayment=()=>{ target[87].payment_status='paid'; };
export const supabase = {
 from(table) {
  const filters=[]; let ordering=null;
  function execute(from=0,to=999) {
   window.__queries.push({table,from,to,ordering});
   if(window.__failure===table && from>=500) return {data:null,error:{message:'Later '+table+' page failed'}};
   let rows=(tables[table]||[]).filter(row=>filters.every(filter=>filter(row)));
   if(ordering) rows=[...rows].sort((a,b)=>a[ordering]<b[ordering]?-1:a[ordering]>b[ordering]?1:0);
   return {data:rows.slice(from,to+1),error:null};
  }
  const q={
   select(){return q},
   order(column){ordering=column;return q},
   eq(column,value){filters.push(row=>row[column]===value);return q},
   neq(column,value){filters.push(row=>row[column]!==value);return q},
   in(column,values){filters.push(row=>values.includes(row[column]));return q},
   is(column,value){filters.push(row=>row[column]===value);return q},
   or(filter){const emails=filter.split(',').map(part=>part.replace('email.ilike.',''));filters.push(row=>emails.includes(row.email));return q},
   async range(from,to){return execute(from,to)},
   async maybeSingle(){const result=execute();return {...result,data:result.data?.[0]||null}},
   then(resolve,reject){return Promise.resolve(execute()).then(resolve,reject)}
  };
  return q;
 }
};`;

before(async () => {
    await build({
        stdin: {
            contents: "import React from 'react';import {createRoot} from 'react-dom/client';import EventFinance from './src/components/admin/EventFinance.jsx';createRoot(document.getElementById('root')).render(<EventFinance isEventManagementModule />);",
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
                rankedin: 'export const useRankedin=()=>({});',
                licenses: `export const hydrateEventLicenses=async(players,eventId)=>players.map(p=>({...p,event_license:{event_id:Number(eventId),full:p.id<=60,temporary:p.id>60&&p.id<=90}}));`,
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

async function openOverview(failure = null) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1000 });
    await page.setContent('<!doctype html><html><body><div id="root"></div></body></html>');
    await page.evaluate(value => { window.__failure = value; }, failure);
    await page.addScriptTag({ path: output });
    await page.waitForFunction(() => /3 system events tracked|Event data unavailable/.test(document.body.textContent));
    return page;
}

async function eventRow(page, name) {
    return page.$$eval('tbody tr', (rows, name) => {
        const row = rows.find(row => row.cells[1]?.textContent.trim() === name);
        if (!row) return null;
        return {
            entries: row.cells[5].querySelector('span').textContent,
            paid: row.cells[5].querySelectorAll('span')[1].textContent.trim(),
            finances: row.cells[6].querySelector('span').textContent,
            licenses: [...row.cells[7].querySelectorAll(':scope > div > div')].map(div => div.firstElementChild.textContent),
        };
    }, name);
}

test('overview counts all entries, payments and licenses beyond 1,000 rows, and refreshes after managing an event', async () => {
    const page = await openOverview();
    try {
        assert.deepEqual(await eventRow(page, eventName), {
            entries: '100', paid: '87 Paid', finances: 'R52,200 / R60,000', licenses: ['60', '30', '10'],
        });
        assert.equal((await eventRow(page, 'Earlier event')).paid, '975 Paid · 1 Comped');
        assert.equal((await eventRow(page, 'RankedIn event')).entries, '1001');
        for (const table of ['event_registrations', 'payments', 'tournament_participants']) {
            assert.deepEqual(await page.evaluate(table => window.__queries.filter(q => q.table === table), table), [
                { table, from: 0, to: 499, ordering: 'id' },
                { table, from: 500, to: 999, ordering: 'id' },
                { table, from: 1000, to: 1499, ordering: 'id' },
            ]);
        }

        await page.click(`button[aria-label="Manage registrations for ${eventName}"]`);
        await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === 'Back to events'));
        await page.evaluate(() => {
            window.__recordPayment();
            [...document.querySelectorAll('button')].find(b => b.textContent === 'Back to events').click();
        });
        await page.waitForFunction(() => document.body.textContent.includes('3 system events tracked'));
        assert.deepEqual(await eventRow(page, eventName), {
            entries: '100', paid: '88 Paid', finances: 'R52,800 / R60,000', licenses: ['60', '30', '10'],
        });
    } finally {
        await page.close();
    }
});

for (const table of ['event_registrations', 'payments', 'tournament_participants']) {
    test(`a failed later ${table} page reports an error without displaying partial totals`, async () => {
        const page = await openOverview(table);
        try {
            assert.match(await page.$eval('[role="alert"]', alert => alert.textContent), new RegExp(`Later ${table} page failed`));
            assert.equal(await eventRow(page, eventName), null);
            await page.evaluate(() => {
                window.__failure = null;
                document.querySelector('[role="alert"] button').click();
            });
            await page.waitForFunction(() => document.body.textContent.includes('3 system events tracked'));
            assert.equal((await eventRow(page, eventName)).paid, '87 Paid');
        } finally {
            await page.close();
        }
    });
}
