import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';
import { buildEventFinanceWorkbook } from '../src/utils/eventFinanceExport.js';

const fixtures = `
const {mode,calls}=window.fixture;
const actor={id:'fixture',email:'operator@example.invalid'};
const event={id:73,event_name:'Synthetic tournament',is_manual:true,organisation_id:'fixture-org',club_id:null,
  start_date:'2026-08-01',end_date:'2026-08-01',organiser_name:'Fixture organiser',entry_fee:600,organiser_interim_payments:[]};
const entry={id:'reg-1',event_id:73,full_name:'Fixture player',email:'player@example.invalid',division:'Open',division_id:'open',
  status:'registered',payment_status:mode==='missing-refund'?'refunded':'paid',created_at:'2026-07-30T00:00:00Z'};
const payment={id:'pay-1',event_id:73,reference:'MANUAL-ADMIN-reg-1',status:'success',payment_method:'eft',
  payment_type:'event_entry_fee',is_test:false,amount:600,created_at:'2026-07-30T00:00:00Z',metadata:{registration_id:entry.id,source:'manual_event_admin'}};
const data={events:[event],registrations:[entry],payments:[payment],divisions:[{id:'open',event_id:73,name:'Open',entry_fee:600}],licenses:[]};
const matches=(row,filters)=>filters.every(([key,values])=>values.includes(row[key]));
export const client={
 auth:{async getUser(){return {data:{user:actor}}}},
 from(name){
   const filters=[];
   return {select(){return this},eq(key,value){filters.push([key,[value]]);return this},in(key,values){filters.push([key,values]);return this},
     order(){return this},abortSignal(){return this},range(){return this},
     async single(){calls.push(['record',name,filters]);return {data:name==='calendar'&&matches(event,filters)?event:null}},
     then(resolve,reject){calls.push(['table',name,filters]);return Promise.resolve({data:[]}).then(resolve,reject)},
   };
 },
 rpc(name,args){
   calls.push([name,args]);
   const mapping={can_manage_event:mode!=='blocked',is_super_admin:mode!=='org'&&mode!=='foreign',is_organisation_admin:mode==='org',
     event_finance_overview_source:data, account_is_active:true};
   const promise=Promise.resolve({data:mapping[name]});
   promise.abortSignal=()=>promise;
   return promise;
 },
 functions:{async invoke(name,args){
   calls.push([name,args.body]);
   if(mode==='gateway-error')return {error:{message:'Gateway unavailable'}};
   return {data:{next_offset:null,unresolved:[]}};
 }}
};
`;
let browser, bundle;
before(async () => {
    const result = await build({
        stdin: { contents: `
            import { createRoot } from 'react-dom/client';
            import EventIncomeStatement from './src/pages/admin-preview/EventIncomeStatement.jsx';
            import { client } from 'statement-fixture';
            const scopeId=window.fixture.mode==='org'?'org:fixture-org':window.fixture.mode==='foreign'?'org:other-org':'all';
            createRoot(document.getElementById('root')).render(<EventIncomeStatement eventId={73} client={client}
              session={{user:{id:'fixture'}}} scopeId={scopeId} onRequestPayout={()=>{ window.fixture.payoutClicks++; }}
              download={async(payload,{isCurrent})=>{if(isCurrent())window.fixture.downloads.push(payload)}}/>);
        `, resolveDir: process.cwd(), loader: 'jsx' },
        write: false, bundle: true, format: 'iife', jsx: 'automatic', logLevel: 'silent',
        plugins: [{ name: 'statement-fixture', setup(build) {
            build.onResolve({ filter: /^statement-fixture$/ }, () => ({ path: 'synthetic', namespace: 'statement' }));
            build.onLoad({ filter: /.*/, namespace: 'statement' }, () => ({ contents: fixtures }));
        } }],
    });
    bundle = result.outputFiles[0].text;
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); });

async function withPage(mode, run) {
    const page = await browser.newPage();
    page.setDefaultTimeout(6500);
    try {
        await page.setContent('<main id="root"></main>');
        await page.evaluate(mode => { window.fixture={mode,calls:[],downloads:[],payoutClicks:0}; }, mode);
        await page.addScriptTag({ content:bundle });
        await run(page);
    } catch (error) {
        error.message += '\nSynthetic screen: ' + await page.evaluate(() => document.body.innerText);
        throw error;
    } finally { await page.close(); }
}
const desk = page => page.evaluate(() => window.fixture);
const text = (page, value) => page.waitForFunction(value=>document.body.innerText.includes(value), {}, value);
async function click(page, label) {
    await page.waitForFunction(label=>[...document.querySelectorAll('button')].some(node=>node.textContent.trim() === label && !node.disabled), {}, label);
    await page.evaluate(label=>[...document.querySelectorAll('button')].find(node=>node.textContent.trim() === label && !node.disabled).click(), label);
}

test('platform uses both current Excel variants with receipt verification, issue reporting and workbook sheets', async () => {
    await withPage('platform', async page => {
        await text(page,'Confirm who received MANUAL-ADMIN-reg-1');
        await click(page, 'Open payout requests');
        assert.equal((await desk(page)).payoutClicks, 1);
        await click(page,'Export Excel');
        assert.equal((await desk(page)).calls.some(([name])=>name==='event-cash-receipts'),false);
        await click(page,'Full Event Report');
        await text(page,'Full Event Report downloaded.');
        await click(page,'Export Excel'); await click(page,'Organisers Consolidated Event Report');
        await text(page,'Organisers Consolidated Event Report downloaded.');
        const { calls, downloads } = await desk(page);
        assert.deepEqual(calls.filter(([name])=>name==='event-cash-receipts').map(([, args])=>args),
            Array.from({length:2},()=>({event_id:73,verify_all:true,verify_refunds:true,offset:0})));
        assert.deepEqual(downloads.map(download=>download.reportType),['full','organiser']);
        const fullSheets = buildEventFinanceWorkbook(downloads[0]).worksheets.map(sheet=>sheet.name);
        const orgSheets = buildEventFinanceWorkbook(downloads[1]).worksheets.map(sheet=>sheet.name);
        assert.ok(fullSheets.includes('Payments ledger') && fullSheets.includes('Refunds ledger'));
        assert.ok(orgSheets.includes('4M receipts') && !orgSheets.includes('Payments ledger'));
        assert.ok(downloads[0].summary.some(row=>row.note?.includes('Confirm who received')));
        assert.equal(downloads[1].payments.length,0);
    });
});
test('organisation owners get only their own consolidated event report', async () => {
    await withPage('org', async page => {
        await click(page,'Export Excel'); await text(page,'Organisers Consolidated Event Report');
        assert.equal(await page.evaluate(()=>[...document.querySelectorAll('button')].some(node=>node.textContent.trim()==='Full Event Report')),false);
        await click(page,'Organisers Consolidated Event Report'); await text(page,'Organisers Consolidated Event Report downloaded.');
        const { calls, downloads } = await desk(page);
        assert.ok(calls.some(([name,args])=>name==='is_organisation_admin' && args.p_organisation_id==='fixture-org'));
        assert.deepEqual(downloads.map(download=>download.reportType),['organiser']);
    });
    await withPage('foreign', async page => {
        await text(page,'Income statement unavailable');
        assert.equal((await desk(page)).calls.some(([name])=>name==='event_finance_overview_source'),false);
    });
});
test('missing refunds and incomplete gateway checks cannot produce a workbook', async () => {
    await withPage('missing-refund', async page => {
        await text(page,'Refund records are missing for a refunded entry.');
        assert.equal(await page.evaluate(()=>[...document.querySelectorAll('button')].some(node=>node.textContent.trim()==='Export Excel')),false);
        assert.equal((await desk(page)).downloads.length,0);
    });
    await withPage('gateway-error', async page => {
        await click(page,'Export Excel'); await click(page,'Full Event Report');
        await text(page,'Payment verification is incomplete.');
        assert.equal((await desk(page)).downloads.length,0);
    });
});
