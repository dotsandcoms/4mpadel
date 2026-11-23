import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';

const fixtureUrl = 'http://calendar-copy.fixture.invalid/';
const fixture = String.raw`
  import React from 'react';
  import { createRoot } from 'react-dom/client';
  import { MemoryRouter } from 'react-router-dom';
  import CalendarWorkspace from './src/pages/admin-preview/CalendarWorkspace.jsx';
  import './src/pages/AdminPreview.css';
  const session = { user: { id:'fixture-user', email:'operator@example.invalid' } };
  const source = { id:11, event_name:'Fixture Cup', slug:'fixture-cup', is_manual:true, organisation_id:'org-a',
    club_id:'club-a', start_date:'2035-03-04', end_date:'2035-03-05' };
  const seriesId = 'a7026ddc-1b70-45f1-a1a1-23d99f3d284e';
  let calendar = [source];
  const occurrences = () => calendar.filter(row => row.series_id === seriesId).map(row => ({
    id:row.id,event_name:row.event_name,start_date:row.start_date,organisation_id:row.organisation_id,club_id:row.club_id,
    unlinked_organiser:null,is_visible:row.is_visible,event_status:row.event_status,
  }));
  window.calls = [];
  Object.defineProperty(navigator, 'clipboard', { configurable:true, value: {
    writeText: async value => { window.copiedLink = value; },
  } });
  const client = {
    auth: { getUser: async () => ({ data:{user:session.user} }) },
    rpc(name,args={}) {
      const pending=(async()=>{
      window.calls.push([name,args]);
      if (name === 'account_is_active') return { data:true };
      if (name === 'is_super_admin') return { data:!window.revoked };
      if (name === 'admin_review_imported_calendar_event') {
        if (args.p_event_id!==source.id || source.is_manual) throw new Error('Unexpected event');
        if (!args.p_changes) return {data:{record:{...source},version:'b'.repeat(32)}};
        if (window.staleImport) return {error:{message:'The event changed after review'}};
        if (args.p_expected!=='b'.repeat(32)) throw new Error('Expected current imported event version');
        Object.assign(source,args.p_changes);
        return {data:{event_id:source.id}};
      }
      if (name === 'admin_calendar_weekly_series_visibility') {
        if (!args.p_expected) return { data:{ source_id:11,series_id:seriesId,occurrences:occurrences() } };
        if (window.failWeekly) return { error:{message:'The weekly series changed after review.'} };
        if (JSON.stringify(args.p_expected)!==JSON.stringify(occurrences())) throw new Error('The reviewed rows were not preserved');
        calendar = calendar.map(row => row.series_id===seriesId ? { ...row,is_visible:args.p_visible } : row);
        return { data:{ source_id:11,series_id:seriesId,updated_count:2,is_visible:args.p_visible } };
      }
      if (name !== 'admin_duplicate_calendar_event') return { data:null };
      if (!args.p_request_id) return { data:{ source_id:11,event_name:'Fixture Cup',organisation_id:'org-a',club_id:'club-a',
        fingerprint:'a'.repeat(32),division_count:2,start_date:source.start_date,end_date:source.end_date } };
      if (window.failCopy) return {error:{message:'The source event or divisions changed. Reopen the review before copying.'}};
      calendar = [...calendar, { ...source, id:15, event_name:args.p_title, slug:'fixture-cup-copy', is_visible:false }];
      return {data:{id:15,event_name:args.p_title,created:true,division_count:2}};
      })();
      pending.abortSignal=()=>pending;
      return pending;
    },
    from(table) {
      let rows = table==='calendar' ? calendar : table==='organisations' ? [
        {id:'org-a',name:'Current organisation',status:'approved'},
        {id:'org-b',name:'New host organisation',status:'approved'},
        {id:'org-c',name:'Unapproved organisation',status:'pending'},
      ] : [];
      let bounds = null;
      const q = {
        select(){return q;},order(){return q;},eq(key,value){rows=rows.filter(r=>r[key]===value);return q;},
        in(key,values){rows=rows.filter(r=>values.includes(r[key]));return q;},range(a,b){bounds=[a,b];return q;},abortSignal(){return q;},
        then(resolve){return Promise.resolve({data:bounds?rows.slice(bounds[0],bounds[1]+1):rows}).then(resolve);},
      };
      return q;
    },
  };
  const root = createRoot(document.getElementById('root'));
  window.renderCalendar = mode => {
    const isTenant=mode.startsWith('tenant');
    const isAdmin=!isTenant&&mode!=='calendar-only';
    const scopeId=isTenant?'org:org-a':'all';
    const permissions=isAdmin?{role:'super_admin'}:isTenant
      ?{role:'org_owner',orgs:[{id:'org-a',member_role:'owner'}]}:{role:'custom',allowed_tabs:['calendar']};
    if (mode.includes('provider')) Object.assign(source,{is_manual:false,rankedin_id:'755'});
    if (mode.includes('weekly')) {
      Object.assign(source, { is_weekly:true,series_id:seriesId,is_visible:true,event_status:'active' });
      calendar = [source,{ ...source,id:12,event_name:'Fixture Cup Week 2',slug:'fixture-cup-week-2',start_date:'2035-03-11',is_visible:false }];
    }
    const query=mode==='create-on-day'?'?calView=month&month=2035-03&day=2035-03-08'
      :mode==='quick-on-day'?'?create=quick&day=2035-03-08':'?calendarEvent=11';
    root.render(<MemoryRouter initialEntries={['/admin-preview/calendar'+query]}><CalendarWorkspace
      client={client} session={session} scopeId={scopeId} scope={{id:scopeId}} permissions={permissions} canManageEvents={isAdmin}/></MemoryRouter>);
  };
`;

async function click(page, text) {
  await page.waitForFunction(text=>[...document.querySelectorAll('button')].some(node=>!node.disabled&&node.textContent.trim()===text), {}, text);
  await page.evaluate(text=>[...document.querySelectorAll('button')].find(node=>!node.disabled&&node.textContent.trim()===text).click(), text);
}

test('Calendar drawer reviews imported changes, event links, copies and weekly visibility', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), '4m-calendar-copy-'));
  let browser;
  try {
    const outfile = path.join(directory, 'fixture.js');
    await build({
      stdin: { contents:fixture, loader:'jsx', resolveDir:process.cwd() },
      bundle:true, format:'iife', platform:'browser', jsx:'automatic', outfile, define:{'import.meta.env':'{}'},
      plugins:[{name:'calendar-test-client',setup(builder){
        builder.onResolve({filter:/\/supabaseClient(?:\.js)?$/},()=>({path:'client',namespace:'test'}));
        builder.onResolve({filter:/\/(?:AdvancedEventDetailsDialog|QuickEventDetailsDialog)(?:\.jsx)?$/},args=>
          ({path:args.path.includes('AdvancedEventDetailsDialog') ? 'advanced-editor' : 'empty-editor',namespace:'test'}));
        builder.onResolve({filter:/\/(?:EventBuilder|QuickEventBuilder)(?:\.jsx)?$/},args=>
          ({path:args.path.includes('QuickEventBuilder') ? 'quick-builder' : 'full-builder',namespace:'test'}));
        builder.onLoad({filter:/./,namespace:'test'},args=>({contents:args.path==='client'
          ? 'export const supabase={};export const isSupabaseConfigured=()=>false;' : args.path==='advanced-editor'
            ? 'export default ({event})=>"Editing reviewed event "+event.id;' : args.path==='empty-editor' ? 'export default ()=>null;'
              : 'export default ({initialDate})=>"Opening '+args.path+' on "+initialDate;'}));
      }}],
    });
    browser = await puppeteer.launch({ headless:true, protocolTimeout:20000,
      args:['--no-sandbox','--unsafely-treat-insecure-origin-as-secure='+new URL(fixtureUrl).origin] });
    const open = async state => {
      const page = await browser.newPage();
      page.setDefaultTimeout(7500);
      await page.setRequestInterception(true);
      page.on('request', request=>request.url()===fixtureUrl
        ? request.respond({contentType:'text/html',body:'<main id="root"></main>'}) : request.abort());
      await page.goto(fixtureUrl);
      await page.addStyleTag({path:path.join(directory,'fixture.css')});
      await page.addScriptTag({path:outfile});
      await page.evaluate(mode=>window.renderCalendar(mode),state);
      return page;
    };
    const admin = await open('admin');
    try {
      await admin.waitForSelector('a[href="https://4mpadel.co.za/calendar/fixture-cup"]');
      await click(admin,'More actions');
      await click(admin,'Copy public link');
      assert.equal(await admin.evaluate(()=>window.copiedLink),'https://4mpadel.co.za/calendar/fixture-cup');
      await click(admin,'More actions');
      await click(admin,'Duplicate event');
      await click(admin,'Review copy');
      assert.equal(await admin.evaluate(()=>window.calls.some(([name,args])=>name==='admin_duplicate_calendar_event'&&args.p_request_id)),false);
      await click(admin,'Cancel');
      await admin.waitForSelector('a[href="https://4mpadel.co.za/calendar/fixture-cup"]');
      await click(admin,'More actions');
      await click(admin,'Duplicate event');
      await click(admin,'Review copy');
      await admin.evaluate(()=>{window.failCopy=true;});
      await click(admin,'Confirm duplicate');
      await admin.waitForFunction(()=>document.querySelector('dialog [role=alert]')?.textContent.includes('source event or divisions changed'));
      await click(admin,'Cancel');
      await admin.waitForSelector('a[href="https://4mpadel.co.za/calendar/fixture-cup"]');
      await click(admin,'More actions');
      await click(admin,'Duplicate event');
      await click(admin,'Review copy');
      await admin.evaluate(()=>{window.failCopy=false;});
      await click(admin,'Confirm duplicate');
      await admin.waitForFunction(()=>document.querySelector('dialog [role=status]')?.textContent.includes('Hidden event copy created'));
      await click(admin,'Open copied event');
      await admin.waitForSelector('a[href="https://4mpadel.co.za/calendar/fixture-cup-copy"]');
      const requests = await admin.evaluate(()=>window.calls.filter(([name,args])=>name==='admin_duplicate_calendar_event'&&args.p_request_id));
      assert.equal(requests.length,2);
      assert.equal(requests[1][1].p_source_id,11);
      assert.equal(requests[1][1].p_title,'Fixture Cup (copy)');
    } finally { await admin.close(); }
    const weekly = await open('admin-weekly');
    const openReview = async () => { await click(weekly, 'More actions'); await click(weekly, 'Review weekly series'); };
    try {
      await openReview();
      await click(weekly, 'Hide weekly series');
      await weekly.waitForFunction(()=>document.querySelector('dialog form p')?.textContent.includes('Hide all 2 reviewed weekly events'));
      assert.equal(await weekly.evaluate(()=>window.calls.some(([name,args])=>name==='admin_calendar_weekly_series_visibility'&&args.p_expected)),false);
      await click(weekly, 'Cancel');
      await openReview();
      await click(weekly, 'Show weekly series');
      await weekly.evaluate(()=>{window.failWeekly=true;});
      await click(weekly, 'Confirm show series');
      await weekly.waitForFunction(()=>document.querySelector('dialog [role=alert]')?.textContent.includes('changed after review'));
      await click(weekly, 'Close');
      await openReview();
      await click(weekly, 'Show weekly series');
      await weekly.evaluate(()=>{window.failWeekly=false;});
      await click(weekly, 'Confirm show series');
      await weekly.waitForFunction(()=>document.querySelector('dialog [role=status]')?.textContent.includes('2 weekly events are now visible'));
      await click(weekly, 'Close');
      await openReview();
      await click(weekly, 'Edit weekly series');
      await weekly.waitForFunction(()=>document.body.innerText.includes('Editing reviewed event 11'));
      const requests = await weekly.evaluate(()=>window.calls.filter(([name,args])=>name==='admin_calendar_weekly_series_visibility'&&args.p_expected));
      assert.equal(requests.length,2);
      assert.equal(requests[1][1].p_event_id,11);
      assert.deepEqual(requests[1][1].p_expected.map(row=>row.id),[11,12]);
      assert.equal(requests[1][1].p_visible,true);
    } finally { await weekly.close(); }
    const onDay = await open('create-on-day');
    try {
      await onDay.waitForFunction(()=>[...document.querySelectorAll('dialog button')].some(button=>button.textContent.trim()==='Create event'),{polling:50});
      await onDay.evaluate(()=>[...document.querySelectorAll('dialog button')].find(button=>button.textContent.trim()==='Create event').click());
      await onDay.waitForFunction(()=>document.body.innerText.includes('Opening full-builder on 2035-03-08'),{polling:50});
    } finally { await onDay.close(); }
    const quickOnDay = await open('quick-on-day');
    try {
      await quickOnDay.waitForFunction(()=>document.body.innerText.includes('Opening quick-builder on 2035-03-08'),{polling:50});
    } finally { await quickOnDay.close(); }
    const imported = await open('provider');
    try {
      await imported.waitForSelector('a[href="/admin-preview/event?event=11"]');
      await click(imported,'Publishing');
      await click(imported,'Edit publishing settings');
      await imported.waitForSelector('dialog input[name=is_visible]');
      assert.equal(await imported.$eval('nav[aria-label="Imported event settings"] button[aria-current=page]', node=>node.textContent),'Publishing');
      await click(imported,'Cancel');
      const edit = async () => {
        await click(imported,'More actions');
        await click(imported,'Edit event details');
        await imported.waitForSelector('input[name=event_name]');
        await imported.type('input[name=event_name]', ' renamed');
        await click(imported,'Review changes');
      };
      const updates = () => imported.evaluate(()=>window.calls.filter(([rpc,args])=>rpc==='admin_review_imported_calendar_event'&&args.p_changes));
      await edit();
      assert.deepEqual(await updates(),[]);
      await imported.evaluate(()=>{window.staleImport=true;});
      await click(imported,'Confirm calendar changes');
      await imported.waitForFunction(()=>document.querySelector('dialog [role=alert]')?.textContent.includes('changed after review'), {polling:50});
      await click(imported,'Cancel');
      await edit();
      await imported.evaluate(()=>{window.revoked=true;});
      await click(imported,'Confirm calendar changes');
      await imported.waitForFunction(()=>document.querySelector('dialog [role=alert]')?.textContent.includes('verified super-admin'), {polling:50});
      assert.equal((await updates()).length,1);
      await click(imported,'Cancel');
      await imported.evaluate(()=>{window.revoked=false;window.staleImport=false;});
      await edit();
      await click(imported,'Back to editing');
      await click(imported,'Organiser');
      await imported.waitForSelector('select[name=organisation_id]');
      assert.equal(await imported.$eval('select[name=organisation_id]', node=>[...node.options].some(option=>option.value==='org-c')),false);
      await imported.click('button[aria-label="Linked organisation"]');
      await imported.waitForFunction(()=>[...document.querySelectorAll('[role=option]')].some(node=>node.textContent.trim()==='New host organisation'),{polling:50});
      await imported.evaluate(()=>[...document.querySelectorAll('[role=option]')].find(node=>node.textContent.trim()==='New host organisation').click());
      await click(imported,'Review changes');
      assert.match(await imported.$eval('dialog dl',node=>node.innerText),/Current organisation → New host organisation/);
      await click(imported,'Confirm calendar changes');
      await imported.waitForFunction(()=>document.querySelector('dialog [role=status]')?.textContent==='Calendar details saved.',{polling:50});
      assert.deepEqual((await updates()).at(-1),['admin_review_imported_calendar_event',{
        p_event_id:11,p_expected:'b'.repeat(32),p_changes:{event_name:'Fixture Cup renamed',organisation_id:'org-b'},
      }]);
      await click(imported,'Done');
      await imported.waitForFunction(()=>document.querySelector('dialog h3')?.textContent==='Fixture Cup renamed',{polling:50});
    } finally { await imported.close(); }
    for (const state of ['tenant','tenant-weekly','tenant-provider','calendar-only']) {
      const denied = await open(state);
      try {
        await click(denied,'More actions');
        assert.equal(await denied.evaluate(()=>[...document.querySelectorAll('button')].some(button=>button.textContent.trim()==='Duplicate event')),false);
        assert.equal(await denied.evaluate(()=>[...document.querySelectorAll('button')].some(button=>button.textContent.trim()==='Review weekly series')),false);
        assert.equal(await denied.evaluate(()=>[...document.querySelectorAll('button')].some(button=>button.textContent.trim()==='Edit event details')),false);
        assert.equal(Boolean(await denied.$('a[href="/admin-preview/event?event=11"]')),state!=='calendar-only');
        assert.equal(await denied.evaluate(()=>window.calls.some(([name])=>['admin_duplicate_calendar_event','admin_calendar_weekly_series_visibility'].includes(name))),false);
      } finally { await denied.close(); }
    }
  } finally {
    await browser?.close();
    await rm(directory,{recursive:true,force:true});
  }
});
