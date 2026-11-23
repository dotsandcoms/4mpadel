import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';
import ExcelJS from 'exceljs';
import { loadRankedinParticipantSnapshot } from '../src/pages/admin-preview/importedParticipantSync.js';

test('a repeated division or conflicting participant identity stops the roster review', async () => {
  const repeated = { participantClasses: async () => [{ Id: 3, Name: 'Open' }, { Id: 5, Name: 'open' }] };
  await assert.rejects(loadRankedinParticipantSnapshot(repeated, '300'), /invalid or repeated division/);
  const conflict = {
    participantClasses: async () => [{ Id: 3, Name: 'Open' }],
    classParticipants: async () => [{ FirstPlayer: { Id: 22, Name: 'One' } }, { FirstPlayer: { Id: 22, Name: 'Two' } }],
  };
  await assert.rejects(loadRankedinParticipantSnapshot(conflict, '300'), /conflicting names/);
});

const fixtureUrl = 'http://rankedin-roster.fixture.invalid/';
const fixture = String.raw`
  import React from 'react';
  import { createRoot } from 'react-dom/client';
  import EventParticipantsWorkspace from './src/pages/admin-preview/EventParticipantsWorkspace.jsx';
  import './src/pages/AdminPreview.css';
  const event = {id:41,event_name:'Fixture RankedIn Cup',rankedin_id:'300',is_manual:false,organisation_id:'org-a',entry_fee:600};
  const session = {user:{id:'fixture-admin',email:'operator@example.invalid'}};
  const token = 'a'.repeat(64);
  let participant = {id:'participant-fixture',event_id:41,full_name:'Local Fixture Player',class_name:'Open',
    rankedin_participant_id:'20',profile_id:null,whatsapp_added:false,is_paid:false};
  const player = {id:55,name:'Fixture Linked Player',email:'linked@example.invalid'};
  const confirmed = { id:'confirmed-player', event_id:41, full_name:'Verified Fixture Player', class_name:'Advanced',
    is_paid:true, whatsapp_added:true, profile_id:55, players:player };
  const payment = {id:'synthetic-payment', event_id:41, payment_type:'event_entry_fee', payment_method:'manual', status:'success',
    amount:123.45, currency:'ZAR', reference:'synthetic-receipt',metadata:{participant_id:confirmed.id,collection_recipient:'organiser'}};
  const anchorClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.download) { window.downloaded = this.download; return; }
    anchorClick.call(this);
  };
  const makeURL = URL.createObjectURL;
  URL.createObjectURL = blob => { window.workbookBlob=blob; return makeURL(blob); };
  window.rosterCalls = [];
  window.failure = false;
  window.revoked = false;
  window.stale = false;
  const client = {
    auth:{getUser:async()=>({data:{user:session.user}})},
    functions:{async invoke(name,{body}) { window.rosterCalls.push([name,body]); return {data:{receipts:[],unresolved:[]}}; }},
    rpc(name,args = {}) {
      window.rosterCalls.push([name,args]);
      let result;
      if (name === 'account_is_active') result = {data:true};
      else if (name === 'is_super_admin') result = {data:!window.fixtureTenant && !window.revoked};
      else if (name === 'can_manage_event') result = {data:Number(args.p_event_id) === event.id};
      else if (name === 'is_organisation_admin') result = {data:window.fixtureFinance === 'owner' && args.p_organisation_id === 'org-a'};
      else if (name === 'event_license_status') result = {data:args.p_player_ids.map(player_id=>({player_id,eligibility:{full:true,temporary:false}}))};
      else if (name === 'event_finance_overview_source' && window.fixtureFinance) result = {data:{
        events:[event],participants:[participant, confirmed],payments:[payment],divisions:[],refunds:[],
      }};
      else if (name === 'admin_import_rankedin_participants' && !args.p_expected) result = {data:{
        event_id:41,token,changes:args.p_entries.map(row=>({action:'add',source_id:row.id,name:row.name,division:row.division})),
      }};
      else if (name === 'admin_import_rankedin_participants' && args.p_expected === token) result = window.stale
        ? {error:{message:'The imported roster or its payment evidence changed.'}}
        : {data:{event_id:41,status:'saved',inserted:2,updated:0,removed:0}};
      else if (name === 'admin_review_imported_participant_payment') result = args.p_expected === token
        ? {data:{event_id:41,participant_id:participant.id,action:'mark',is_paid:true,payment_id:'payment-fixture',registration_reset:false}}
        : {data:{event_id:41,participant_id:participant.id,action:'mark',token,amount:500,resets_registration:false}};
      else result = {data:null};
      const query = Promise.resolve(result);
      return Object.assign(query,{abortSignal:()=>query});
    },
    from(table) {
      let rows = table === 'calendar' ? [event] : table === 'tournament_participants' ? (window.fixtureFinance ? [participant, confirmed] : [participant]) : table === 'players' ? [player] : [];
      let patch;
      const q = {select(){return q;},eq(key,value){rows=rows.filter(row=>String(row[key])===String(value));return q;},
        is(key,value){ rows=rows.filter(row=>(row[key]??null)===value);return q; },
        update(fields){patch=fields;return q;},
        in(){return q;},order(){return q;},range(a,b){rows=rows.slice(a,b+1);return q;},abortSignal(){return q;},
        single(){
          if(table==='tournament_participants'&&patch&&rows.length===1){
            participant={...participant,...patch};
            window.rosterCalls.push(['participant-write',patch]);
            return Promise.resolve({data:participant});
          }
          return Promise.resolve({data:rows[0]||null});
        },
        then(resolve,reject){return Promise.resolve({data:rows}).then(resolve,reject);},
      };
      return q;
    },
  };
  window.renderRoster = (tenant, finance) => {
    window.fixtureTenant = tenant;
    window.fixtureFinance = finance;
    createRoot(document.getElementById('root')).render(<EventParticipantsWorkspace client={client} event={event}
      session={session} scopeId={tenant?'org:org-a':'all'} initialView={finance?'dashboard':'table'} go={()=>{}}/>);
  };
`;

async function click(page, label) {
  await page.waitForFunction(text => [...document.querySelectorAll('button')].some(node => !node.disabled && node.textContent.trim() === text), { polling: 75 }, label);
  await page.evaluate(text => [...document.querySelectorAll('button')].find(node => !node.disabled && node.textContent.trim() === text).click(), label);
}

test('New Admin reviews every RankedIn division, protects the roster on failure and enforces fresh staff authority', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), '4m-rankedin-roster-'));
  let browser;
  try {
    const outfile = path.join(directory, 'fixture.js');
    await build({
      stdin: { contents: fixture, loader: 'jsx', resolveDir: process.cwd() },
      bundle: true, format: 'iife', platform: 'browser', jsx: 'automatic', outfile, define: { 'import.meta.env': '{}' },
      plugins: [{ name: 'synthetic-data-only', setup(builder) {
        builder.onResolve({ filter: /\/supabaseClient(?:\.js)?$/ }, () => ({ path: 'client', namespace: 'fixture' }));
        builder.onLoad({ filter: /./, namespace: 'fixture' }, () => ({ contents: 'export const supabase={};' }));
      } }],
    });
    browser = await puppeteer.launch({ headless: true, protocolTimeout: 20000, args: ['--no-sandbox'] });
    const open = async (tenant = false, finance = '') => {
      const page = await browser.newPage();
      const requests = [];
      const errors = [];
      let failedDivision = false;
      page.on('pageerror', error => errors.push(error.message));
      page.setDefaultTimeout(8500);
      await page.setRequestInterception(true);
      page.on('request', request => {
        if (request.url() === fixtureUrl) return request.respond({ contentType: 'text/html', body: '<main id="root"></main>' });
        const url = new URL(request.url());
        if (url.origin !== 'https://api.rankedin.com') return request.abort();
        requests.push(url);
        const headers = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
        if (url.pathname.endsWith('GetPlayersTabAsync')) return request.respond({ headers, body: JSON.stringify([{ Id: 3, Name: 'Open' }, { Id: 4, Name: 'Advanced' }]) });
        const classId = url.searchParams.get('tournamentClassId');
        if (classId === '4' && failedDivision) return request.respond({ headers, status: 502, body: '{}' });
        const body = classId === '3'
          ? { Teams: [{ FirstPlayer: { Id: 11, Name: 'Fixture First' }, SecondPlayer: { Id: 0 } }] }
          : { Participants: [{ Participant: { FirstPlayer: { Id: 12, Name: 'Fixture Second' } } }] };
        return request.respond({ headers, body: JSON.stringify(body) });
      });
      await page.goto(fixtureUrl);
      await page.addStyleTag({ path: path.join(directory, 'fixture.css') });
      await page.addScriptTag({ path: outfile });
      await page.evaluate((tenant, finance) => window.renderRoster(tenant, finance), tenant, finance);
      return { page, requests, errors, failDivision: value => { failedDivision = value; } };
    };
    const admin = await open();
    const rpcCalls = () => admin.page.evaluate(() => window.rosterCalls.filter(([name]) => name === 'admin_import_rankedin_participants'));
    const alert = text => admin.page.waitForFunction(text => [...document.querySelectorAll('dialog[open] [role="alert"]')].some(node => node.textContent.includes(text)), { polling: 75 }, text);
    admin.failDivision(true);
    await click(admin.page, 'Review RankedIn sync');
    await alert('HTTP 502');
    assert.deepEqual(await rpcCalls(), []);
    admin.failDivision(false);
    await click(admin.page, 'Reload roster');
    await admin.page.waitForFunction(() => document.querySelector('dialog[open]')?.textContent.includes('2 to add'), { polling: 75 });
    assert.deepEqual((await rpcCalls())[0][1], {
      p_event_id: 41, p_rankedin_id: '300', p_entries: [{ id: '12', name: 'Fixture Second', division: 'Advanced' }, { id: '11', name: 'Fixture First', division: 'Open' }],
    });
    assert.ok(admin.requests.every(url => (url.searchParams.get('tournamentId') || url.searchParams.get('id')) === '300'));
    await click(admin.page, 'Close');
    assert.equal((await rpcCalls()).some(([, args]) => args.p_expected), false);

    await click(admin.page, 'Review RankedIn sync');
    await admin.page.waitForFunction(() => document.querySelector('dialog[open]')?.textContent.includes('2 to add'), { polling: 75 });
    await admin.page.evaluate(() => { window.revoked = true; });
    await click(admin.page, 'Confirm roster changes');
    await alert('verified super-admin');
    assert.equal((await rpcCalls()).some(([, args]) => args.p_expected), false);
    await admin.page.evaluate(() => { window.revoked = false; window.stale = true; });
    await click(admin.page, 'Close');

    await click(admin.page, 'Review RankedIn sync');
    await click(admin.page, 'Confirm roster changes');
    await alert('payment evidence changed');
    await admin.page.evaluate(() => { window.stale = false; });
    await click(admin.page, 'Close');
    await click(admin.page, 'Review RankedIn sync');
    await click(admin.page, 'Confirm roster changes');
    await admin.page.waitForFunction(() => document.querySelector('dialog[open]')?.textContent.includes('Roster updated. 2 added'), { polling: 75 });
    await click(admin.page, 'Done');
    const paymentCalls = () => admin.page.evaluate(() => window.rosterCalls.filter(([name]) => name === 'admin_review_imported_participant_payment'));
    await click(admin.page, 'Review payment');
    await click(admin.page, 'Confirm payment');
    await admin.page.waitForFunction(() => document.querySelector('dialog[open]')?.textContent.includes('Manual entry payment recorded'), { polling: 75 });
    assert.deepEqual((await paymentCalls())[0][1], { p_event_id: 41, p_participant_id: 'participant-fixture', p_scope: 'all' });
    assert.ok((await paymentCalls())[1][1].p_expected);
    await click(admin.page, 'Done');

    await click(admin.page, 'Update group record');
    assert.equal(await admin.page.evaluate(() => window.rosterCalls.some(([name]) => name === 'participant-write')), false);
    await click(admin.page, 'Confirm group record');
    await admin.page.waitForFunction(() => document.querySelector('dialog[open]')?.textContent.includes('Record updated'), { polling: 75 });
    assert.deepEqual(await admin.page.evaluate(() => window.rosterCalls.find(([name]) => name === 'participant-write')), ['participant-write', { whatsapp_added: true }]);
    await click(admin.page, 'Done');

    await click(admin.page, 'Link profile');
    await admin.page.type('dialog[open] input[type="search"]', 'Linked Player');
    await admin.page.waitForSelector('dialog[open] input[type="radio"]');
    await admin.page.click('dialog[open] input[type="radio"]');
    await click(admin.page, 'Confirm profile link');
    await admin.page.waitForFunction(() => document.querySelector('dialog[open]')?.textContent.includes('Record updated'), { polling: 75 });
    assert.deepEqual(await admin.page.evaluate(() => window.rosterCalls.filter(([name]) => name === 'participant-write').at(-1)), ['participant-write', { profile_id: 55 }]);
    await click(admin.page, 'Done');
    assert.deepEqual(admin.errors, []);

    const tenant = await open(true);
    await tenant.page.waitForFunction(() => document.body.textContent.includes('Local Fixture Player'), { polling: 75 });
    const restrictedControls = ['Review RankedIn sync', 'Review payment', 'Update group record', 'Link profile'];
    assert.equal(await tenant.page.evaluate(labels => [...document.querySelectorAll('button')].some(node => labels.includes(node.textContent.trim())), restrictedControls), false);
    assert.deepEqual(tenant.requests, []);
    assert.deepEqual(tenant.errors, []);

    const finance = await open(true,'owner');
    const board = finance.page;
    await board.waitForFunction(() => document.body.innerText.includes('Financial summary'), {polling:75});
    assert.equal(await board.$('.pp-table'), null);
    assert.match(await board.$eval('.ap-imported-dashboard', node=>node.innerText), /123[.,]45/);
    assert.equal(await board.$eval('a[href*="rankedin.com"]', node=>node.href), 'https://www.rankedin.com/en/tournament/300');
    await click(board, 'Participant table');
    const choose = async (label, value) => {
      await board.$eval('button[aria-label="'+label+'"]', node=>node.click());
      await board.waitForFunction(value=>[...document.querySelectorAll('[role="option"]')].some(node=>node.getClientRects().length&&node.firstChild.textContent===value),{polling:75},value);
      await board.evaluate(value=>[...document.querySelectorAll('[role="option"]')].find(node=>node.getClientRects().length&&node.firstChild.textContent===value).click(),value);
    };
    await choose('Participant profile','Linked profiles');
    await choose('Participant division','Advanced');
    await choose('Participant licence','Full licence');
    await choose('Participant payment','Paid');
    await choose('Participant WhatsApp','Added to WhatsApp');
    await board.waitForFunction(() => document.body.textContent.includes('Showing 1 of 2'), {polling:75});
    await click(board, 'Dashboard cards');
    await click(board, 'Participant table');
    assert.equal(await board.$eval('.pp-table tbody td b', node=>node.textContent), 'Verified Fixture Player');
    await click(board, 'Export Excel');
    await board.waitForFunction(() => Boolean(window.downloaded), {polling:75});
    const exported = await board.evaluate(async()=>({name:window.downloaded,bytes:[...new Uint8Array(await window.workbookBlob.arrayBuffer())]}));
    assert.equal(exported.name,'fixture-rankedin-cup-participants.xlsx');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(exported.bytes));
    const sheet = workbook.getWorksheet('Event Finance');
    assert.equal(sheet.getCell('A4').value,'Verified Fixture Player');
    assert.equal(sheet.getCell('I4').value,123.45);
    assert.equal(sheet.getCell('I6').value,123.45);
    await click(board, 'Clear filters');
    await board.waitForFunction(() => document.body.textContent.includes('Showing 2 of 2'), {polling:75});
    assert.deepEqual(finance.requests, []);
    assert.deepEqual(finance.errors, []);
    assert.deepEqual(await board.evaluate(() => window.rosterCalls.filter(([name])=>name==='event-cash-receipts')),
      [['event-cash-receipts',{event_id:41,verify_all:true,verify_refunds:true,offset:0}]]);
  } finally {
    await browser?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
