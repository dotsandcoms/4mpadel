import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';

const root = process.cwd();
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), '4m-manager-workflow-'));
const event = { id: 101, event_name: 'ADIDAS PADEL TOUR', start_date: '2026-10-22', early_bird_fee: 0, early_bird_ends_at: '2026-09-01' };
const registrations = [
    { id: 'hugo', event_id: 101, full_name: 'Hugo Venter', email: 'hugo@example.com', phone: '0829014471', partner_email: 'zaheer@example.com', partner_name: 'Zaheer Ally', division: "Men’s Open", division_id: 'open', payment_status: 'paid', status: 'registered', created_at: '2026-10-01' },
    { id: 'zaheer', event_id: 101, full_name: 'Zaheer Ally', email: 'zaheer@example.com', partner_email: 'hugo@example.com', partner_name: 'Hugo Venter', registered_by: 'hugo@example.com', division: "Men’s Open", division_id: 'open', payment_status: 'paid', status: 'registered', created_at: '2026-10-01' },
];
const payments = [{ id: 'receipt', reference: 'REGEV-101-team', event_id: 101, amount: 1600, status: 'success', payment_method: 'paystack', payment_type: 'event_entry_fee', metadata: { email: 'hugo@example.com', registrant_name: 'Hugo Venter', covers: registrations.map(r => ({ type: 'entry', email: r.email, division: r.division })), registration_rows: registrations } }];
const mockSupabase = `
window.__calls=[]; window.__workbooks=[];
const registrations=${JSON.stringify(registrations)};
const tables={ event_registrations:registrations, payments:${JSON.stringify(payments)}, tournament_divisions:[{id:'open',event_id:101,name:'Men’s Open',entry_fee:800,max_teams:24,license_required:true}], calendar:{organiser_interim_payments:[]} };
export const supabase={
 auth:{ getUser:async()=>({data:{user:{email:'admin@example.com'}}}) },
 rpc:async(name,args)=>{
  window.__calls.push({name,args});
  if(name==='can_manage_event') return {data:true};
  if(name==='find_registration_partner') return {data:[{id:3,name:'Replacement Player',email:'replacement@example.com'}]};
  if(name==='replace_registration_player') return window.__replacementError ? {error:{message:window.__replacementError}} : {data:{}};
  return {data:[]};
 },
 from:(name)=>{
  let update=false;
  const query={then(resolve,reject){return Promise.resolve({data:update?[]:tables[name]||[],error:null}).then(resolve,reject)}};
  for(const method of ['select','eq','in','lt','order','limit','neq','ilike','or']) query[method]=()=>query;
  query.update=()=>{update=true;return query};
  query.maybeSingle=async()=>({data:tables[name]||null,error:null});
  return query;
 },
 functions:{invoke:async(name,args)=>{
  window.__calls.push({name,args});
  if(name==='event-cash-receipts') return new Promise(resolve=>{window.__finishVerification=(complete=true)=>resolve({data:{receipts:[],non_receipts:[{reference:'REGEV-101-team'}],unresolved:complete?[]:[{reason:'Gateway unavailable'}],next_offset:null}})});
  return {data:{}};
 }}
};`;
const output = path.join(temporary, 'fixture.js');
await build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import Manager from './src/components/admin/ManualEventRegistrations.jsx';createRoot(document.getElementById('root')).render(<Manager variant="inline" isOpen event={${JSON.stringify(event)}} />);`, resolveDir: root, loader: 'jsx' }, outfile: output, bundle: true, platform: 'browser', format: 'iife', define: { 'process.env.NODE_ENV': '"test"' }, plugins: [{ name: 'manager-fixture', setup(builder) {
    builder.onResolve({ filter: /supabaseClient$/ }, () => ({ path: 'supabase', namespace: 'mock' }));
    builder.onResolve({ filter: /useAdminPermissions$/ }, () => ({ path: 'permissions', namespace: 'mock' }));
    builder.onResolve({ filter: /\/utils\/emails$/ }, () => ({ path: 'email', namespace: 'mock' }));
    builder.onResolve({ filter: /\/utils\/eventFinanceExport$/ }, () => ({ path: 'export', namespace: 'mock' }));
    builder.onResolve({ filter: /\/utils\/licenses$/ }, () => ({ path: 'licenses', namespace: 'mock' }));
    builder.onResolve({ filter: /\/utils\/playerLookup$/ }, () => ({ path: 'lookup', namespace: 'mock' }));
    builder.onResolve({ filter: /^(\.\/|\.\.\/)[^/]*[A-Z][^/]*$/ }, args => args.importer.endsWith('ManualEventRegistrations.jsx') && !args.path.includes('ReplaceRegistrationPlayerDialog') ? ({ path: 'component', namespace: 'mock' }) : null);
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: {
        supabase: mockSupabase,
        permissions: "export const useAdminPermissions=()=>({permissions:{role:'super_admin'}});",
        email: 'export const sendEmail=async()=>{};',
        export: 'export const downloadEventFinanceWorkbook=async payload=>{window.__workbooks.push(payload)};',
        licenses: 'export const hydrateEventLicenses=async players=>players;',
        lookup: 'export const fetchPlayersByEmails=async()=>[];export const buildPlayersByEmailMap=players=>new Map(players.map(p=>[p.email,p]));',
    }[args.path] || 'export default function Component(){return null}', loader: 'js' }));
} }] });

const clickText = async (page, text, selector = 'button') => {
    await page.waitForFunction((selector, text) => [...document.querySelectorAll(selector)].some(el => el.textContent.trim() === text), {}, selector, text);
    await page.evaluate((selector, text) => [...document.querySelectorAll(selector)].find(el => el.textContent.trim() === text).click(), selector, text);
};

test('event manager loads without reports and offers substitution without paid-partner eligibility', async () => {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1500, height: 1100 });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.setContent('<!doctype html><html><head></head><body style="background:#000"><div id="root"></div></body></html>');
        const css = fs.readdirSync(path.join(root, 'dist/assets')).find(name => /^index-.*\.css$/.test(name));
        if (css) await page.addStyleTag({ path: path.join(root, 'dist/assets', css) });
        await page.addScriptTag({ path: output });
        await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.includes('Export Excel') && !b.disabled));
        assert.equal(await page.evaluate(() => window.__calls.filter(c => c.name === 'event-cash-receipts').length), 0);
        assert.equal(await page.evaluate(() => window.__calls.filter(c => c.name === 'get_paid_partner_replacements').length), 0);
        await clickText(page, 'Teams');
        await clickText(page, 'Men’s Open', 'h3');
        await clickText(page, 'Replace player');
        await page.waitForSelector('dialog[open]');
        await page.click('input[value="zaheer"]');
        await page.type('#replacement-player-search', 'Replacement');
        await page.waitForSelector('ul[aria-label="Matching players"] button');
        await page.click('ul[aria-label="Matching players"] button');
        assert.ok(await page.$eval('dialog', el => el.textContent.includes('Zaheer Ally') && el.textContent.includes('stays paired with Hugo Venter')));
        await page.screenshot({ path: '/tmp/4m-replace-player-desktop.png', fullPage: true });
        await page.setViewport({ width: 390, height: 844 });
        await page.screenshot({ path: '/tmp/4m-replace-player-mobile.png' });
        assert.ok(await page.$eval('dialog', el => el.getBoundingClientRect().width <= 390 && el.scrollWidth <= el.clientWidth));
        await page.evaluate(() => { window.__replacementError = 'This player already has an entry in this division.'; });
        await page.click('dialog button[type="submit"]');
        await page.waitForSelector('dialog [role="alert"]');
        assert.equal(await page.$eval('dialog[open] input:checked', el => el.value), 'zaheer');
        await page.evaluate(() => { window.__replacementError = null; });
        await page.click('dialog button[type="submit"]');
        await page.waitForFunction(() => !document.querySelector('dialog[open]'));
        const replacement = await page.evaluate(() => window.__calls.filter(c => c.name === 'replace_registration_player').at(-1));
        assert.deepEqual(replacement.args, { p_registration_id: 'zaheer', p_expected_email: 'zaheer@example.com', p_expected_partner_email: 'hugo@example.com', p_new_player_id: 3 });
        assert.equal(await page.evaluate(() => window.__calls.filter(c => c.name === 'event-cash-receipts').length), 0);
        await page.setViewport({ width: 1500, height: 1100 });
        await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.includes('Export Excel') && !b.disabled));
        await clickText(page, 'Export Excel');
        await page.click('button[role="menuitem"]');
        await page.waitForFunction(() => !!window.__finishVerification);
        assert.equal(await page.evaluate(() => window.__workbooks.length), 0);
        assert.ok(await page.evaluate(() => [...document.querySelectorAll('button')].some(b => b.textContent.includes('Preparing report…') && b.disabled)));
        await page.evaluate(() => window.__finishVerification(false));
        await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.includes('Export Excel') && !b.disabled));
        assert.equal(await page.evaluate(() => window.__workbooks.length), 0, 'failed verification must prevent export');
        await page.evaluate(() => { window.__finishVerification = null; });
        await clickText(page, 'Export Excel');
        await page.click('button[role="menuitem"]');
        await page.waitForFunction(() => !!window.__finishVerification);
        await page.evaluate(() => window.__finishVerification());
        await page.waitForFunction(() => window.__workbooks.length === 1);
        const workbook = await page.evaluate(() => window.__workbooks[0]);
        assert.equal(workbook.summary.find(row => row.label === 'Gross Paystack entry receipts').value, 0, 'export uses fresh gateway evidence');
        assert.equal(workbook.lineItems.filter(row => row.id.startsWith('cash-')).length, 0, 'line items use the same fresh verification');
        assert.deepEqual(errors, []);
    } finally {
        await browser.close();
        fs.rmSync(temporary, { recursive: true, force: true });
    }
});
