import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';
import ExcelJS from 'exceljs';
import puppeteer from 'puppeteer';
import { buildFinancialSummary, financialSummaryScope, filteredFinancialSummary, loadFinancialSummary, verifyFinancialSummaryScope } from '../src/pages/admin-preview/financialSummaryData.js';
import { buildFinancialSummaryWorkbook, financialSummaryCsv } from '../src/pages/admin-preview/financialSummaryExport.js';

const user = { id: 'synthetic-finance-operator', email: 'operator@example.invalid' };
const north = { id: 'north', name: 'North Finance', member_role: 'admin' };
const northEvent = { id: 11, organisation_id: north.id, event_name: 'Home / Open', is_manual: true, finance_managed: true, entry_fee: 240, start_date: '2035-01-03' };
const northLeague = { ...northEvent, id: 12, event_name: 'Home Open', is_manual: false, entry_fee: 123.45, start_date: '2035-01-02' };
const southEvent = { ...northEvent, id: 21, finance_managed: false, organisation_id: 'south', event_name: 'South private event' };
const events = [northEvent, northLeague, southEvent];
const players = [
  { id: 1, name: 'Alice Player', email: 'alice@example.invalid', license_type: 'full', paid_registration: true, approved: true },
  { id: 2, name: 'Bob Player', email: 'bob@example.invalid', license_type: 'temporary', paid_registration: true, approved: false },
  { id: 3, name: 'Native unpaid player', email: 'native-unpaid@example.invalid', license_type: 'none', paid_registration: false },
  { id: 9, name: 'South private player', email: 'south@example.invalid', license_type: 'none', paid_registration: false },
];
const native = { id: 'native-entry', event_id: 11, email: 'alice@example.invalid', full_name: 'Alice Player', division: 'Open', payment_status: 'paid', status: 'registered' };
const unpaid = { ...native, id: 'native-unpaid', full_name: 'Native unpaid player', email: 'native-unpaid@example.invalid', payment_status: 'pending' };
const imported = { id: 'imported-row', event_id: 12, email: 'bob@example.invalid', full_name: 'Bob Player', class_name: 'League', profile_id: 2, is_paid: true };
const payment = (id, eventId, playerId, amount, metadata, extra = {}) => ({ id, event_id: eventId, player_id: playerId, reference: id,
  payment_type: 'event_entry_fee', payment_method: 'manual', status: 'success', amount, created_at: '2035-01-01T10:00:00Z', metadata, ...extra });
const northPay = payment('home-receipt', 11, 1, '240.00', { registration_id: native.id, collection_recipient: '4m' });
const leaguePay = payment('league-receipt', 12, 2, '123.45', { participant_id: imported.id, collection_recipient: 'organiser' });
const attempt = payment('failed-attempt', 11, 1, 240, {}, { status: 'failed' });
const licence = payment('membership-receipt', null, 1, 180, {}, { payment_type: 'membership' });
const outside = payment('south-private-money', 21, 9, 900, {});
const testPay = payment('test-pay', 11, 1, 1000, { is_test: true });
const payments = [northPay, leaguePay, attempt, licence, outside, testPay];
const refunds = [
  { id: 'refund', payment_id: northPay.id, event_registration_id: native.id, amount: 25, status: 'processed', created_at: '2035-01-04' },
  { id: 'reserve', payment_id: northPay.id, event_registration_id: native.id, amount: 5, status: 'processing', created_at: '2035-01-04' },
  { id: 'failed-refund', payment_id: northPay.id, event_registration_id: native.id, amount: 10, status: 'failed', created_at: '2035-01-04' },
];
function source(ids) {
  const selected = payments.filter(row => ids.includes(row.event_id));
  return { events: events.filter(event => ids.includes(event.id)), registrations: [native, unpaid].filter(row => ids.includes(row.event_id)),
    participants: [imported].filter(row => ids.includes(row.event_id)), payments: selected,
    refunds: refunds.filter(row => selected.some(payment => payment.id === row.payment_id)), divisions: [],
    licenses: [{ event_id: 11, identity: native.email, eligibility: { full: true, temporary: false } },
      { event_id: 12, identity: '2', eligibility: { full: false, temporary: true } }].filter(row => ids.includes(row.event_id)),
  };
}

const platformScope = financialSummaryScope({ role: 'super_admin' }, 'all');
const tenantScope = financialSummaryScope({ role: 'org_owner', orgs: [north] }, 'org:north');
const granted = { role: 'custom', allowed_tabs: ['finance'], module_permissions: { finance: { allowedTabs: ['summary'], allowedEvents: [12] } } };

function mockFinance({ platform = false, secret = false, assigned = [], actorActive = true, moveDuringLoad = false, membershipEmail = user.email,
  allowedTabs = ['summary'], standalone = false } = {}) {
  const calls = [];
  let moved = false;
  const result = data => ({ data, error: null });
  const client = {
    auth: { getUser: async () => result({ user }) },
    rpc(name, args) {
      calls.push([name, args]);
      const response = Promise.resolve(result({ account_is_active: actorActive, is_super_admin: platform,
        event_finance_overview_source: name === 'event_finance_overview_source' && source(args.p_event_ids),
      }[name]));
      if (name === 'event_finance_overview_source' && moveDuringLoad) moved = true;
      response.abortSignal = () => response;
      return response;
    },
    from(table) {
      let rows = { calendar: moved ? events.map(event => event.id === 12 ? { ...event, organisation_id: 'south' } : event) : events,
        players, payments, payment_refunds: refunds, organisation_members: standalone ? [] : [
          { organisation_id: 'north', role: 'admin', user_email: membershipEmail, organisations: { ...north, status: 'approved' } },
        ],
        admin_sidebar_permissions: [{ ...granted, email: user.email,
          module_permissions: { finance: { allowedTabs, allowedEvents: assigned } } }],
      }[table] || [];
      const filters = {};
      const query = { select: () => query, order: () => query, abortSignal: () => query,
        eq(key, value) { filters[key] = value; if (!secret) rows = rows.filter(row => row[key] === value); return query; },
        ilike(key, value) { filters[key] = value; rows = rows.filter(row => key === 'user_email' || String(row[key]).toLowerCase() === value); return query; },
        in(key, values) { filters[key] = values; if (!secret) rows = rows.filter(row => values.includes(row[key])); return query; },
        range(first, last) { rows = rows.slice(first, last + 1); return query; },
        maybeSingle() { calls.push([table, filters]); return Promise.resolve(result(rows[0])); },
        then(resolve, reject) { calls.push([table, filters]); return Promise.resolve(result(rows)).then(resolve, reject); },
      };
      return query;
    },
  };
  return { client, calls, moveEvent: () => { moved = true; } };
}

const fakeOptions = (fixture, scope) => ({ client: fixture.client, expectedUserId: user.id, scope });

test('consolidated totals use successful receipts and linked non-failed refunds with canonical entry settlement', async () => {
  const data = buildFinancialSummary({ scope: platformScope, events, sources: [source([11,12,21])], players, payments, refunds });
  assert.deepEqual(data.overview.totals, { count: 4, gross: 144345, refunds: 3000, net: 141345 });
  assert.equal(data.players.find(row => row.id === 1).gross, 42000);
  assert.equal(data.players.find(row => row.id === 1).net, 39000);
  assert.equal(data.entries.find(row => row.id === '11:native-entry').net, 210);
  assert.equal(data.entries.find(row => row.id === '11:native-entry').reserve, 5);
  assert.equal(data.entries.find(row => row.id === '12:imported-row').net, 123.45);
  assert.equal(data.transactions.find(row => row.reference === attempt.reference).included, false);
  assert.equal(data.transactions.find(row => row.id === 'Refund:failed-refund').included, false);
  assert.equal(data.transactions.some(row => row.reference === testPay.reference), false);
  assert.deepEqual(filteredFinancialSummary(data, 'events', 'Home / Open').map(row => row.name), ['Alice Player', 'Native unpaid player']);
  const workbook = await buildFinancialSummaryWorkbook(data);
  assert.deepEqual(workbook.worksheets.map(sheet => sheet.name), ['Global Summary', 'Global Player Ledger', 'Transactions History', 'Home Open', 'South private event', 'Home Open (2)']);
  assert.equal(workbook.getWorksheet('Global Summary').getCell('B5').value, 1413.45);
  assert.equal(workbook.getWorksheet('Global Player Ledger').getCell('H2').value, 390);
  assert.equal((await workbook.xlsx.writeBuffer()).byteLength > 5000, true);
});

test('scoped finance uses only own events and exact linked players and fences moved or revoked records before download', async () => {
  const fixture = mockFinance();
  const data = await loadFinancialSummary(fakeOptions(fixture, tenantScope));
  assert.deepEqual(data.reports.map(row => row.event.id), [11, 12]);
  assert.deepEqual(data.players.map(row => row.id), [1, 2, 3]);
  assert.equal(data.players.find(row => row.id === 3).gross, 0);
  assert.equal(data.transactions.some(row => row.reference === outside.reference || row.reference === licence.reference), false);
  assert.equal(fixture.calls.some(([name]) => ['payments', 'payment_refunds'].includes(name)), false);
  assert.ok(fixture.calls.filter(([name]) => name === 'players').every(([, query]) =>
    (Array.isArray(query.id) && !query.id.includes(9)) || (Array.isArray(query.email) && !query.email.includes('south@example.invalid'))));
  const workbook = await buildFinancialSummaryWorkbook(data);
  assert.equal(workbook.getWorksheet('Global Player Ledger'), undefined);
  assert.ok(workbook.getWorksheet('Event Player Ledger'));
  await verifyFinancialSummaryScope({ ...fakeOptions(fixture, tenantScope), reports: data.reports });
  fixture.moveEvent();
  await assert.rejects(verifyFinancialSummaryScope({ ...fakeOptions(fixture, tenantScope), reports: data.reports }), /scope changed/);
  await assert.rejects(loadFinancialSummary(fakeOptions(mockFinance({ moveDuringLoad: true }), tenantScope)), /scope changed/);
  const differentMember = mockFinance({ membershipEmail: 'another-operator@example.invalid' });
  await assert.rejects(loadFinancialSummary(fakeOptions(differentMember, tenantScope)), /access is required/);
  assert.equal(differentMember.calls.some(([name]) => name === 'calendar'), false);
  const staleSuper = mockFinance();
  await assert.rejects(loadFinancialSummary(fakeOptions(staleSuper, platformScope)), /access is required/);
  assert.deepEqual(staleSuper.calls.map(([name])=>name), ['account_is_active','is_super_admin']);
  await assert.rejects(loadFinancialSummary(fakeOptions(mockFinance({ secret: true }), tenantScope)), /outside this Finance workspace/);
});

test('assigned finance verifies its current exact event grants and CSV neutralizes formulas and CSV separators', async () => {
  const scope = financialSummaryScope(granted, 'all');
  assert.equal(financialSummaryScope({ ...granted, orgs: [north] }, 'all'), null);
  assert.equal(financialSummaryScope({ ...granted, module_permissions: { finance: { allowedTabs: ['events'], allowedEvents: [12] } } }, 'all'), null);
  const denied = mockFinance({ assigned: [21], standalone: true });
  await assert.rejects(loadFinancialSummary(fakeOptions(denied, scope)), /assigned events changed/);
  assert.equal(denied.calls.some(([name]) => name === 'calendar'), false);
  const eventsOnly = mockFinance({ assigned: [12], allowedTabs: ['events'], standalone: true });
  await assert.rejects(loadFinancialSummary(fakeOptions(eventsOnly, scope)), /summary access/);
  assert.equal(eventsOnly.calls.some(([name]) => name === 'calendar'), false);
  const fixture = mockFinance({ assigned: [12], standalone: true });
  const data = await loadFinancialSummary(fakeOptions(fixture, scope));
  assert.deepEqual(data.reports.map(row => row.event.id), [12]);
  const csv = financialSummaryCsv('players', [{ ...data.players[0], name: ' \t=cmd', email: 'a,"b"@example.invalid' }]);
  assert.match(csv, /"' \t=cmd","a,""b""@example.invalid"/);
  assert.doesNotMatch(csv, /Alice Player|South private/);
});

test('a standalone Summary grant without assignments reads only finance-managed events', async () => {
  const managed = { ...granted, module_permissions: { finance: { allowedTabs: ['summary'] } } };
  const scope = financialSummaryScope(managed, 'all');
  assert.equal(scope.mode, 'managed');
  assert.equal(financialSummaryScope({ ...managed, module_permissions: {
    finance: { allowedTabs: ['summary'], allowedEvents: ['invalid'] },
  } }, 'all'), null);
  const fixture = mockFinance({ standalone: true });
  const data = await loadFinancialSummary(fakeOptions(fixture, scope));
  assert.deepEqual(data.reports.map(row => row.event.id), [11, 12]);
  assert.equal(data.transactions.some(row => [outside.reference, licence.reference].includes(row.reference)), false);
  assert.ok(fixture.calls.filter(([name]) => name === 'calendar').every(([, query]) => query.finance_managed === true));
  const tenant = mockFinance();
  await assert.rejects(loadFinancialSummary(fakeOptions(tenant, scope)), /summary access/);
  assert.equal(tenant.calls.some(([name]) => name === 'calendar'), false);
});

const fixturePage = 'http://finance-summary.fixture.invalid/';
const browserFixture = `
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import FinanceOverview from './src/pages/admin-preview/FinanceOverview.jsx';
import './src/pages/AdminPreview.css';
import './src/pages/admin-preview/FinanceOverview.css';
const user = ${JSON.stringify(user)};
const rows = ${JSON.stringify({ events, players, payments, refunds, source: source([11,12,21]) })};
const organisation = ${JSON.stringify(north)};
const response = data=>({data});
window.requests=[]; window.downloads=[];
const originalUrl=URL.createObjectURL;
URL.createObjectURL=blob=>{ const url=originalUrl(blob); window.downloadBlob=blob; return url; };
const originalClick=HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click=function(){ if(this.download)window.downloads.push(this.download); else originalClick.call(this); };
const client={
  auth:{getUser:async()=>response({user})},
  functions:{invoke:async()=>response({summaries:[]})},
  rpc(name,args){
    window.requests.push([name,args]);
    let data;
    if(name==='account_is_active')data=true;
    if(name==='is_super_admin')data=!window.tenant && !window.revoked;
    if(name==='event_finance_overview_source') {
      const ids=args.p_event_ids;
      const selected=rows.source.payments.filter(row=>ids.includes(row.event_id));
      data={ ...rows.source, events:rows.events.filter(row=>ids.includes(row.id)), payments:selected,
        registrations:rows.source.registrations.filter(row=>ids.includes(row.event_id)), participants:rows.source.participants.filter(row=>ids.includes(row.event_id)),
        licenses:rows.source.licenses.filter(row=>ids.includes(row.event_id)), refunds:rows.refunds.filter(row=>selected.some(payment=>payment.id===row.payment_id)) };
    }
    const result=Promise.resolve(response(data)); result.abortSignal=()=>result; return result;
  },
  from(table){
    let data={calendar:rows.events,players:rows.players,payments:rows.payments,payment_refunds:rows.refunds,
      organisation_members:window.tenant && !window.revoked ? [{organisation_id:'north',role:'admin',user_email:user.email}]:[]}[table]||[];
    const match={};
    const query={select(){return query},order(){return query},abortSignal(){return query},
      eq(key,value){ match[key]=value; data=data.filter(row=>row[key]===value); return query; },
      ilike(key,value){ match[key]=value; data=data.filter(row=>String(row[key]).toLowerCase()===value); return query; },
      in(key,values){ match[key]=values; data=data.filter(row=>values.includes(row[key])); return query; },
      range(start,end){data=data.slice(start,end+1);return query},
      then(resolve,reject){window.requests.push([table,match]);return Promise.resolve(response(data)).then(resolve,reject);},
    };return query;
  },
};
const root=createRoot(document.getElementById('fixture'));
function Location(){const {pathname,search}=useLocation();return <output hidden data-location={pathname+search}/>;}
window.start=role=>{
  window.tenant=role!=='super_admin';
  const permissions=window.tenant?{role:'org_owner',orgs:[{...organisation,member_role:role}]}:{role};
  root.render(<MemoryRouter><FinanceOverview client={client} session={{user}}
    permissions={permissions} scopeId={window.tenant?'org:north':'all'}/><Location/></MemoryRouter>);
};
`;

async function click(page, label) {
  const available = label => [...document.querySelectorAll('button')].some(button => !button.disabled && button.textContent.trim() === label);
  await page.waitForFunction(available, { polling: 50 }, label);
  await page.evaluate(label => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === label).click(), label);
}

const pageText = (page, text) => page.waitForFunction(text => document.body.innerText.includes(text), { polling: 50 }, text);
const setSearch = (page, value) => page.$eval('.fo-search input', (input, value) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}, value);

test('Finance reports opens the scoped summary, downloads searched CSV and Excel, and rejects revoked or staff access', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), '4m-financial-summary-'));
  let browser;
  try {
    const outfile = path.join(directory, 'fixture.js');
    await build({ stdin: { contents: browserFixture, loader: 'jsx', resolveDir: process.cwd() }, bundle: true,
      format: 'iife', platform: 'browser', jsx: 'automatic', outfile, define: { 'import.meta.env': '{}' } });
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'], protocolTimeout: 20000 });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(8000);
    await page.setRequestInterception(true);
    page.on('request', request => request.url() === fixturePage
      ? request.respond({ contentType: 'text/html', body: '<main class="ap-root"><section id="fixture"></section></main>' }) : request.abort());
    await page.goto(fixturePage);
    await page.addStyleTag({ path: path.join(directory, 'fixture.css') });
    await page.addScriptTag({ path: outfile });
    await page.evaluate(() => window.start('admin'));
    await pageText(page, 'Event settlements');
    assert.equal(await page.$eval('[aria-label="Finance report views"]', nav => nav.innerText.trim()), 'Event settlements\nSummary report');
    await click(page, 'Summary report');
    await pageText(page, 'Alice Player');
    await pageText(page, 'Bob Player');
    await page.$eval('a[href="/admin-preview/event?event=12&tab=statement"]', a => a.click());
    await page.waitForSelector('output[data-location="/admin-preview/event?event=12&tab=statement"]');
    await setSearch(page, 'Alice');
    await click(page, 'Export filtered CSV');
    await pageText(page, 'Downloaded 1 filtered row.');
    const csv = await page.evaluate(() => window.downloadBlob.text());
    assert.match(csv, /Alice Player/);
    assert.doesNotMatch(csv, /Bob Player|South private/);
    await click(page, 'Players');
    await setSearch(page, 'bob@example.invalid');
    await click(page, 'Export filtered CSV');
    await page.waitForFunction(()=>window.downloads.length===2,{polling:50});
    const playerCsv = await page.evaluate(() => window.downloadBlob.text());
    assert.match(playerCsv, /Bob Player/);
    assert.doesNotMatch(playerCsv, /Alice Player|South private/);
    await click(page, 'Export consolidated Excel');
    await pageText(page, 'Downloaded the consolidated workbook for North Finance.');
    const bytes = await page.evaluate(async()=>[...new Uint8Array(await window.downloadBlob.arrayBuffer())]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(bytes));
    assert.deepEqual(workbook.worksheets.map(sheet=>sheet.name), ['Scoped Summary', 'Event Player Ledger', 'Transactions History', 'Home Open', 'Home Open (2)']);
    assert.equal(workbook.getWorksheet('Scoped Summary').getCell('B5').value, 333.45);
    assert.equal(workbook.getWorksheet('Event Player Ledger').getCell('A2').value, 'Alice Player');
    const requests = await page.evaluate(() => window.requests);
    assert.equal(requests.some(([name]) => ['payments', 'payment_refunds'].includes(name)), false);
    await page.evaluate(() => { window.revoked = true; });
    await click(page, 'Export consolidated Excel');
    await pageText(page, 'Current Finance report access is required for this workspace.');
    assert.equal(await page.evaluate(() => window.downloads.length), 3);
    await page.evaluate(() => window.start('staff'));
    await pageText(page, 'Event Finance access is required.');
    assert.equal(await page.$('[aria-label="Finance report views"]'), null);
    assert.equal(await page.$('button[aria-pressed="true"]'), null);
    assert.equal(await page.evaluate(() => document.body.innerText.includes('Alice Player')), false);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
