import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';

const root = process.cwd();
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), '4m-reconciliation-screens-'));
const output = path.join(temporary, 'fixture.js');
let browser;
const mock = `
const reg = (id,extra={}) => ({id,event_id:1,full_name:id.toUpperCase(),email:id+'@example.com',division:'Open',division_id:'open',status:'registered',payment_status:'paid',created_at:'2026-10-01T10:00:00Z',...extra});
const pay=(id,amount,method='paystack',recipient='4m')=>({id,event_id:1,amount,reference:method==='paystack'?'REGEV-1-'+id:'MANUAL-ADMIN-'+id,payment_type:'event_entry_fee',payment_method:method,status:'success',created_at:'2026-10-01T10:00:00Z',metadata:{registration_id:id,email:id+'@example.com',division:'Open',collection_recipient:recipient,...(method==='paystack'?{}:{source:'manual_event_admin',marked_by_admin:true,note:'Verified receipt'})}});
const event={id:1,is_manual:true,event_name:'Reconciliation test',entry_fee:600,start_date:'2026-10-01',end_date:'2026-10-02',organiser_interim_payments:[{id:'request-1',amount:200,paid_at:'2026-10-02'}]};
const tables={calendar:[event],event_registrations:[reg('a'),reg('b'),reg('c'),reg('d',{payment_status:'pending'}),reg('old',{status:'withdrawn',payment_status:'refunded'})],payments:[pay('a',600),pay('b',600,'eft'),pay('c',600,'eft','organiser'),pay('old',550)],tournament_divisions:[{id:'open',event_id:1,name:'Open',entry_fee:600}],payment_refunds:[{id:'refund-old',event_registration_id:'old',payment_id:'old',amount:550,status:'processed',metadata:{cover_type:'entry'},processed_at:'2026-10-02'}],tournament_participants:[]};
window.__tables=tables;window.__writes=[];
export const supabase={auth:{getUser:async()=>({data:{user:{email:'admin@example.com'}}})},functions:{invoke:async(name)=>{
 if(name!=='event-cash-receipts') throw new Error('Unexpected endpoint '+name);
 return {data:{receipts:tables.payments.filter(p=>p.payment_method==='paystack').map(p=>({reference:p.reference,status:'success',amount:p.amount,currency:'ZAR'})),non_receipts:[],unresolved:[],next_offset:null}};
}},from(table){
 let operation='select',values,filters=[],ordering=null;
 const execute=(from=0,to=Infinity)=>{
  if(window.__fail===table)return {data:null,error:{message:table+' unavailable'}};
  let rows=(tables[table]||[]).filter(r=>filters.every(f=>f(r)));
  if(operation==='update'){rows.forEach(r=>Object.assign(r,values));window.__writes.push({table,operation,values});}
  if(operation==='insert'){rows=Array.isArray(values)?values:[values];(tables[table]||=[]).push(...rows);window.__writes.push({table,operation,values});}
  if(ordering)rows=[...rows].sort((a,b)=>String(a[ordering]).localeCompare(String(b[ordering])));
  return {data:structuredClone(rows.slice(from,to+1)),error:null};
 };
 const q={select(){return q},eq(k,v){filters.push(r=>typeof r[k]==='object'?JSON.stringify(r[k])===v:r[k]===v);return q},neq(k,v){filters.push(r=>r[k]!==v);return q},is(k,v){filters.push(r=>r[k]===v||r[k]==null&&v===null);return q},in(k,v){filters.push(r=>v.includes(r[k]));return q},lt(k,v){filters.push(r=>r[k]<v);return q},order(k){ordering=k;return q},update(v){operation='update';values=v;return q},insert(v){operation='insert';values=v;return q},async range(f,t){return execute(f,t)},async maybeSingle(){const r=execute();return {...r,data:r.data?.[0]||null}},async single(){return q.maybeSingle()},then(resolve,reject){return Promise.resolve(execute()).then(resolve,reject)}};return q;
}};`;

before(async () => {
    await build({ stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import Manager from './src/components/admin/ManualEventRegistrations.jsx';import Dashboard from './src/components/admin/FinancialDashboard.jsx';const root=createRoot(document.getElementById('root'));const allowed=[1];window.__showManager=()=>root.render(<Manager variant="inline" isOpen event={structuredClone(window.__tables.calendar[0])}/>);window.__showDashboard=()=>root.render(<Dashboard allowedEvents={allowed} onSelectEvent={id=>window.__selected=id}/>);window.__showManager();`, resolveDir: root, loader: 'jsx' }, outfile: output, bundle: true, platform: 'browser', format: 'iife', define: { 'process.env.NODE_ENV': '"test"' },
        plugins: [{ name: 'isolated-financial-records', setup(builder) {
            builder.onResolve({ filter: /supabaseClient$/ }, () => ({ path: 'supabase', namespace: 'mock' }));
            for (const [filter, name] of [[/useAdminPermissions$/, 'permissions'], [/\/utils\/playerLookup$/, 'players'], [/\/utils\/commerce$/, 'commerce'], [/\/utils\/eventActivityLog$/, 'activity'], [/\/utils\/emails$/, 'emails'], [/\/utils\/eventFinanceExport$/, 'export']]) builder.onResolve({ filter }, () => ({ path: name, namespace: 'mock' }));
            builder.onResolve({ filter: /^\.\/[A-Z][^/]*$/ }, args => args.importer.endsWith('ManualEventRegistrations.jsx') ? ({ path: 'component', namespace: 'mock' }) : null);
            builder.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: {
                supabase: mock, permissions: "export const useAdminPermissions=()=>({permissions:{role:'super_admin'}})",
                players: 'export const fetchPlayersByEmails=async()=>[];export const buildPlayersByEmailMap=()=>new Map();',
                commerce: 'export const fetchCommerceConfig=async()=>null;export const matchLicenseTypeByAmount=()=>null;',
                activity: 'export const logEventActivity=async()=>{};', emails: 'export const sendEmail=async()=>({success:true});',
                export: 'export const downloadEventFinanceWorkbook=async payload=>{window.__export=payload;};',
                component: 'export default function Component(){return null}',
            }[args.path], loader: 'jsx', resolveDir: root }));
        } }], loader: { '.png': 'dataurl' } });
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); fs.rmSync(temporary, { recursive: true, force: true }); });

async function open() {
    const page = await browser.newPage();
    await page.setViewport({ width: 1600, height: 1100 });
    await page.setContent('<!doctype html><html><body style="background:#0a0a0a"><div id="root"></div></body></html>');
    const assets = path.join(root, 'dist/assets');
    const css = fs.existsSync(assets) ? fs.readdirSync(assets).find(name => /^index-.*\.css$/.test(name)) : null;
    if (css) await page.addStyleTag({ content: fs.readFileSync(path.join(root, 'dist/assets', css), 'utf8') });
    page.on('pageerror', error => { throw error; });
    await page.addScriptTag({ path: output });
    await page.waitForFunction(() => document.body.textContent.includes('R 912,50'));
    return page;
}
const clickText = (page, label) => page.evaluate(label => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === label)?.click(), label);
const metric = (page, label) => page.evaluate(label => [...document.querySelectorAll('p,h3')].find(p => p.textContent.trim() === label)?.nextElementSibling?.textContent.replace(/\s/g, ''), label);

test('existing Overview, Income Statement, export and finance overview reconcile the same event', async () => {
    const page = await open();
    try {
        assert.equal(await metric(page, 'Balance due from 4M'), 'R912,50');
        await page.screenshot({path:'/tmp/4m-reconciliation-overview.png',fullPage:true});
        await clickText(page, 'Income Statement');
        await page.waitForFunction(() => document.querySelector('input[placeholder="Search player, division, type, status..."]'));
        assert.equal(await metric(page, 'Total billed'), 'R2950,00');
        assert.equal(await metric(page, 'Total collected'), 'R2350,00');
        assert.equal(await metric(page, 'Net entry income'), 'R1800,00');
        assert.equal(await metric(page, 'Platform Fees'), '−R87,50');
        await page.screenshot({path:'/tmp/4m-reconciliation-statement.png',fullPage:true});
        assert.equal(await metric(page, 'Balance due from 4M'), 'R912,50');
        await clickText(page, 'Export Excel');
        await page.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].find(b => b.textContent.includes('Full Event Report')).click());
        await page.waitForFunction(() => window.__export);
        const result = await page.evaluate(() => ({ summary: window.__export.summary, lines: window.__export.lineItems,
            registrations: window.__export.registrations, activeRegistrationIds: window.__export.activeRegistrationIds, receiptReport: window.__export.receiptReport }));
        assert.equal(result.summary.find(r => r.label === 'Net due to organiser').value, 912.5);
        assert.equal(result.summary.find(r => r.label === 'Commission base: entry fees received by 4M').value, 1750);
        assert.equal(result.registrations.find(r => r.registrationId === 'c').paidDirectToOrganiser, 600);
        assert.equal(result.registrations.find(r => r.registrationId === 'c').paidTo4M, 0);
        assert.equal(result.registrations.find(r => r.registrationId === 'b').paidTo4M, 600);
        assert.deepEqual(result.activeRegistrationIds.sort(), ['a', 'b', 'c', 'd']);
        assert.equal(result.receiptReport.withdrawals.find(r => r.registrationId === 'old').refunded, 550);
        assert.equal(result.summary.find(r => r.label === 'Minus direct organiser receipts retained').value, -600);
        const settlementCategories = ['Entry payment', 'Entry refund', 'Platform / commission fee', 'Direct organiser receipts retained', 'Interim payout'];
        assert.equal(result.lines.filter(r => settlementCategories.includes(r.category)).reduce((n, r) => n + r.amount, 0), 912.5);
        await page.evaluate(() => window.__showDashboard());
        await page.waitForFunction(() => document.body.textContent.includes('Event finance summary'));
        assert.equal(await metric(page, 'Total cash collected'), 'R2350,00');
        assert.equal(await metric(page, 'Total balance owed'), 'R912,50');
        await page.screenshot({path:'/tmp/4m-reconciliation-finance-overview.png',fullPage:true});
        const cells = await page.$$eval('tbody tr', rows => [...rows[0].cells].map(c => c.textContent.replace(/\s/g, '')));
        assert.deepEqual(cells.slice(1), ['4', 'R2350,00', 'R550,00', 'R87,50', 'R600,00', 'R200,00', 'R912,50']);
        await clickText(page, 'Reconciliation test');
        assert.equal(await page.evaluate(() => window.__selected), 1);
        await page.select('select[aria-label="Filter event reconciliations"]', 'settled');
        assert.equal(await metric(page, 'Total cash collected'), 'R0,00');
    } finally { await page.close(); }
});

test('manual partner-paid VAPC entries display the payer and export their separate club collection', async () => {
    const page = await open();
    try {
        await page.evaluate(() => {
            Object.assign(window.__tables.payments.find(p => p.id === 'c').metadata,
                { paid_by_email: 'a@example.com', paid_by_name: 'A', collection_recipient_name: 'VAPC' });
            window.__showDashboard();
        });
        await page.waitForFunction(() => document.body.textContent.includes('Event finance summary'));
        await page.evaluate(() => window.__showManager());
        await page.waitForFunction(() => document.body.textContent.includes('R 912,50'));
        await clickText(page, 'Registrations List');
        await page.waitForFunction(() => document.body.textContent.includes('Paid direct to VAPC'));
        const text = await page.evaluate(() => [...document.querySelectorAll('tr')].find(r => r.textContent.includes('c@example.com')).textContent);
        assert.match(text, /Paid by A/);
        assert.match(text, /Paid direct to VAPC/);
        await clickText(page, 'Export Excel');
        await page.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].find(b => b.textContent.includes('Organisers Consolidated')).click());
        await page.waitForFunction(() => window.__export);
        const result = await page.evaluate(() => window.__export);
        const row = result.registrations.find(r => r.registrationId === 'c');
        assert.equal(row.paymentStatus, 'Paid by Partner A');
        assert.equal(row.collectionRecipient, 'VAPC');
        assert.equal(row.paidTo4M, 0);
        assert.equal(row.paidDirectToOrganiser, 600);
        assert.equal(result.summary.find(r => r.label === 'Commission base: entry fees received by 4M').value, 1750);
    } finally { await page.close(); }
});

test('an entry accepted on credit shows payment due without exporting promised money as cash or commission', async () => {
    const page = await open();
    try {
        await page.evaluate(() => {
            const receipt = window.__tables.payments.find(p => p.id === 'b');
            receipt.status = 'pending';
            Object.assign(receipt.metadata, { payment_expected: true, payment_expected_note: 'Will pay 4M' });
            window.__showDashboard();
        });
        await page.waitForFunction(() => document.body.textContent.includes('Event finance summary'));
        await page.evaluate(() => window.__showManager());
        await page.waitForFunction(() => document.body.textContent.includes('R 342,50'));
        await clickText(page, 'Registrations List');
        await page.waitForFunction(() => document.body.textContent.includes('Payment due to 4M'));
        await clickText(page, 'Export Excel');
        await page.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].find(b => b.textContent.includes('Full Event Report')).click());
        await page.waitForFunction(() => window.__export);
        const result = await page.evaluate(() => window.__export);
        const row = result.registrations.find(r => r.registrationId === 'b');
        assert.equal(row.paymentStatus, 'Paid');
        assert.equal(row.paidTo4M, 0);
        assert.equal(row.outstanding, 600);
        assert.equal(row.channel, 'Payment due to 4M');
        assert.equal(row.collectionRecipient, '4M (payment due)');
        assert.equal(result.summary.find(r => r.label === 'Commission base: entry fees received by 4M').value, 1150);
    } finally { await page.close(); }
});

test('an unallocated receipt remains cash and is reserved from payout in the screen and export', async () => {
    const page = await open();
    try {
        await page.evaluate(() => {
            window.__tables.payments.push({ id:'credit',event_id:1,amount:800,reference:'REGEV-1-credit',
                payment_type:'event_entry_fee',payment_method:'paystack',status:'success',created_at:'2026-10-03T10:00:00Z',
                metadata:{email:'a@example.com',covers:[{type:'entry',email:'a@example.com',division:'Open'}],unallocated_credit_amount:800} });
            window.__showDashboard();
        });
        await page.waitForFunction(() => document.body.textContent.includes('Event finance summary'));
        await page.evaluate(() => window.__showManager());
        await page.waitForFunction(() => document.body.textContent.replace(/\s/g,'').includes('R1672,50'));
        assert.match(await page.$eval('body',e=>e.textContent), /Unallocated credit held by 4M/);
        await clickText(page, 'Export Excel');
        await page.evaluate(() => [...document.querySelectorAll('[role="menuitem"]')].find(b => b.textContent.includes('Full Event Report')).click());
        await page.waitForFunction(() => window.__export);
        const result = await page.evaluate(() => window.__export);
        assert.equal(result.summary.find(r => r.label === 'Unallocated credit held by 4M').value, 800);
        assert.equal(result.summary.find(r => r.label === 'Available for payout after reserves').value, 872.5);
        assert.equal(result.receiptReport.receipts.find(r => r.reference === 'REGEV-1-credit').unallocatedCredit, 800);
        assert.equal(result.activeRegistrationIds.length, 4);
    } finally { await page.close(); }
});

test('editing the existing payment recipient updates the payout without inserting another receipt', async () => {
    const page = await open();
    try {
        await clickText(page, 'Registrations List');
        await page.evaluate(() => { const row = [...document.querySelectorAll('tr')].find(r => r.textContent.includes('b@example.com')); [...row.querySelectorAll('button')].find(b => b.textContent.trim() === 'Edit payment').click(); });
        await page.waitForSelector('#entry-payment-recipient');
        await page.select('#entry-payment-recipient', 'organiser');
        await clickText(page, 'Save payment');
        await page.waitForFunction(() => window.__writes.some(w => w.table === 'payments' && w.values.metadata));
        await page.waitForFunction(() => !document.querySelector('#entry-payment-recipient'));
        await clickText(page, 'Overview');
        await page.waitForFunction(() => document.body.textContent.includes('R 342,50'));
        assert.equal(await metric(page, 'Balance due from 4M'), 'R342,50');
        const writes = await page.evaluate(() => window.__writes.filter(w => w.table === 'payments' && w.values.metadata));
        assert.equal(writes.length, 1);
        assert.equal(writes[0].operation, 'update');
        assert.equal(await page.evaluate(() => window.__tables.payments.find(p => p.id === 'b').amount), 600);
        assert.equal(writes[0].values.metadata.collection_recipient, 'organiser');
    } finally { await page.close(); }
});

test('finance overview fails visibly instead of replacing an unavailable refund ledger with zero', async () => {
    const page = await open();
    try {
        await page.evaluate(() => { window.__fail = 'payment_refunds'; window.__showDashboard(); });
        await page.waitForSelector('[role="alert"]');
        assert.match(await page.$eval('[role="alert"]', e => e.textContent), /payment_refunds unavailable/);
        assert.equal(await metric(page, 'Total balance owed'), undefined);
    } finally { await page.close(); }
});


test('historical manual receipts can be classified without reinstating a withdrawn entry', async () => {
    const page = await open();
    try {
        await page.evaluate(() => {
            const old = window.__tables.payments.find(p => p.id === 'old');
            old.payment_method = 'eft'; old.metadata.collection_recipient = undefined;
            window.__showDashboard();
        });
        await page.waitForFunction(() => document.body.textContent.includes('Event finance summary'));
        await page.evaluate(() => window.__showManager());
        await page.waitForFunction(() => document.body.textContent.includes('Confirm who received'));
        await clickText(page, 'Registrations List');
        await page.evaluate(() => {
            const select = [...document.querySelectorAll('select')].find(e => [...e.options].some(o => o.value === 'withdrawn'));
            select.value = 'withdrawn'; select.dispatchEvent(new Event('change', {bubbles:true}));
        });
        await page.evaluate(() => { const row = [...document.querySelectorAll('tr')].find(r => r.textContent.includes('old@example.com')); [...row.querySelectorAll('button')].find(b => b.textContent.trim() === 'Edit payment').click(); });
        await page.waitForSelector('#entry-payment-recipient');
        await page.select('#entry-payment-recipient', '4m');
        await page.type('textarea', 'Historical bank receipt');
        await clickText(page, 'Save payment');
        await page.waitForFunction(() => !document.querySelector('#entry-payment-recipient'));
        assert.equal(await page.evaluate(() => window.__tables.event_registrations.find(r => r.id === 'old').status), 'withdrawn');
        assert.equal(await page.evaluate(() => window.__tables.event_registrations.find(r => r.id === 'old').payment_status), 'refunded');
    } finally { await page.close(); }
});


test('recording a manual payout cannot overwrite a payment recorded concurrently', async () => {
    const page = await open();
    try {
        await page.evaluate(() => { const event = window.__tables.calendar[0]; event.organiser_interim_payments = [...event.organiser_interim_payments, {id:'concurrent',amount:50,paid_at:'2026-10-03'}]; });
        await page.type('input[placeholder="Amount (R)"]', '100');
        await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Add').click());
        await page.waitForFunction(() => window.__writes.some(w => w.table === 'calendar'));
        const rows = await page.evaluate(() => window.__tables.calendar[0].organiser_interim_payments);
        assert.deepEqual(rows.map(r => r.amount), [200, 50]);
    } finally { await page.close(); }
});
