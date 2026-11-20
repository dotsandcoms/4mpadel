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
    async rpc(name,args={}) {
      window.calls.push([name,args]);
      if (name === 'account_is_active' || name === 'is_super_admin') return { data:true };
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
    },
    from(table) {
      let rows = table==='calendar' ? calendar : [];
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
    const isAdmin = !mode.startsWith('tenant');
    const scopeId = isAdmin ? 'all' : 'org:org-a';
    const permissions = isAdmin ? {role:'super_admin'} : {role:'org_owner',orgs:[{id:'org-a',member_role:'owner'}]};
    if (mode==='provider') source.is_manual=false;
    if (mode.includes('weekly')) {
      Object.assign(source, { is_weekly:true,series_id:seriesId,is_visible:true,event_status:'active' });
      calendar = [source,{ ...source,id:12,event_name:'Fixture Cup Week 2',slug:'fixture-cup-week-2',start_date:'2035-03-11',is_visible:false }];
    }
    root.render(<MemoryRouter initialEntries={['/admin-preview/calendar?calendarEvent=11']}><CalendarWorkspace
      client={client} session={session} scopeId={scopeId} scope={{id:scopeId}} permissions={permissions} canManageEvents={isAdmin}/></MemoryRouter>);
  };
`;

async function click(page, text) {
  await page.waitForFunction(text=>[...document.querySelectorAll('button')].some(node=>!node.disabled&&node.textContent.trim()===text), {}, text);
  await page.evaluate(text=>[...document.querySelectorAll('button')].find(node=>!node.disabled&&node.textContent.trim()===text).click(), text);
}

test('Calendar drawer opens canonical public links and reviews confirmed copies and weekly series', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), '4m-calendar-copy-'));
  let browser;
  try {
    const outfile = path.join(directory, 'fixture.js');
    await build({
      stdin: { contents:fixture, loader:'jsx', resolveDir:process.cwd() },
      bundle:true, format:'iife', platform:'browser', jsx:'automatic', outfile, define:{'import.meta.env':'{}'},
      plugins:[{name:'calendar-test-client',setup(builder){
        builder.onResolve({filter:/\/supabaseClient(?:\.js)?$/},()=>({path:'client',namespace:'test'}));
        builder.onResolve({filter:/\/(?:AdvancedEventDetailsDialog|CreateEventDialog|CreateQuickEventDialog|QuickEventDetailsDialog)(?:\.jsx)?$/},args=>
          ({path:args.path.includes('AdvancedEventDetailsDialog') ? 'advanced-editor' : 'empty-editor',namespace:'test'}));
        builder.onLoad({filter:/./,namespace:'test'},args=>({contents:args.path==='client'
          ? 'export const supabase={};export const isSupabaseConfigured=()=>false;' : args.path==='advanced-editor'
            ? 'export default ({event})=>"Editing reviewed event "+event.id;' : 'export default ()=>null;'}));
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
    for (const state of ['tenant','tenant-weekly','provider']) {
      const denied = await open(state);
      try {
        await click(denied,'More actions');
        assert.equal(await denied.evaluate(()=>[...document.querySelectorAll('button')].some(button=>button.textContent.trim()==='Duplicate event')),false);
        assert.equal(await denied.evaluate(()=>[...document.querySelectorAll('button')].some(button=>button.textContent.trim()==='Review weekly series')),false);
        assert.equal(await denied.evaluate(()=>window.calls.some(([name])=>['admin_duplicate_calendar_event','admin_calendar_weekly_series_visibility'].includes(name))),false);
      } finally { await denied.close(); }
    }
  } finally {
    await browser?.close();
    await rm(directory,{recursive:true,force:true});
  }
});
