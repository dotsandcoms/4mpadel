import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';

const fixtureUrl = 'http://organisation-host.fixture.invalid/';
const fixture = String.raw`
  import { createRoot } from 'react-dom/client';
  import { MemoryRouter } from 'react-router-dom';
  import OrganisationsWorkspace from './src/pages/admin-preview/OrganisationsWorkspace.jsx';
  import './src/pages/AdminPreview.css';
  import { supabase } from './src/supabaseClient';
  const org = { id:'org-a', name:'Fixture Organisation', status:'approved', contact_email:'host@example.invalid' };
  const event = { id:41,event_name:'Home tournament',organisation_id:'org-a',club_id:null,is_manual:true,is_quick_event:false,
    slug:'host-tournament',event_status:'active',is_visible:true,sanction_requested:true,federation_sanction_status:'pending',
    sanction_status:'approved',start_date:'2035-03-04',venue:'Fixture courts' };
  const events = [event,{...event,id:42,event_name:'Other tenant event',organisation_id:'org-b',sanction_status:'rejected',rejection_notes:'Other tenant feedback'},
    {...event,id:43,event_name:'Quick format',is_quick_event:true,rejection_notes:'Stale feedback'},
    {...event,id:44,event_name:'Declined tournament',sanction_status:'rejected',rejection_notes:'Submit the venue confirmation.'},
    {...event,id:46,event_name:'Federation declined tournament',federation_sanction_status:'rejected',rejection_notes:'Send the corrected draw format.'}];
  const weekly = {id:'weekly-draft',organisation_id:org.id, name:'Fixture social series', start_date:'2035-03-09', weeks:5,
    revision:1, fields:{event_name:'Fixture social series',organisation_id:org.id}};
  window.calls = [];
  window.authorised = [];
  window.render = role => {
    const session = { user:{ id:'host-user',email:'host@example.invalid' } };
    const client = {
      auth:{ getUser:async()=>({data:{user:session.user}}) },
      async rpc(name,args={}) {
        window.calls.push([name,args]);
        if (name==='account_is_active') return {data:true};
        if (name==='is_super_admin') return {data:false};
        if (name==='admin_weekly_event_draft') {
          if (window.revoked || role==='staff' || args.p_host!==org.id) return {error:{message:'Current organisation owner or admin access is required.'}};
          return {data:args.p_action==='list'?[weekly]:weekly};
        }
        if (name==='admin_organisation_host_builder') {
          if (window.revoked || role==='staff') return {error:{message:'Current organisation owner or admin access is required.'}};
          return {data:{organisation:org, event_id:args.p_event_id ?? null, platform:false, clubs:[{id:'club-a',name:'Fixture courts'}]}};
        }
        return {data:null};
      },
      from(table) {
        let rows = table==='organisations' ? [org,{...org,id:'org-b',name:'Other organisation'}]
          : table==='organisation_members' ? [{organisation_id:'org-a',user_email:session.user.email,role}]
          : table==='calendar' ? events : table==='tournament_divisions' ? [{ id:'full-div',event_id:41 },{id:'quick-div',event_id:43}] : [];
        let bounds=null;
        const q = {
          select(){return q;},ilike(){return q;},order(){return q;},
          eq(key,value){window.calls.push([table,key,value]);rows=rows.filter(row=>row[key]===value);return q;},
          in(key,values){rows=rows.filter(r=>values.includes(r[key]));return q;},
          range(a,b){bounds=[a,b];return q;},abortSignal(){return q;},
          single(){return Promise.resolve({data:rows[0]});},
          then(resolve){return Promise.resolve({data:bounds?rows.slice(bounds[0],bounds[1]+1):rows}).then(resolve);},
        };
        return q;
      },
    };
    Object.assign(supabase, client);
    createRoot(document.getElementById('root')).render(<MemoryRouter><OrganisationsWorkspace scopeId="org:org-a" client={supabase} session={session}/></MemoryRouter>);
  };
`;

const stubBuilder = type => `
  import { useState } from 'react';
  export default function Builder({organisation,organisationClubs,editingEvent,weeklyDraft,beforeSave,onSaved,onClose}) {
    const [error,setError]=useState('');
    const confirm=async()=>{
      try {
        const auth=await beforeSave({operation:'save',event:editingEvent,payload:{
          organisation_id:organisation.id,venue:'Fixture courts',venues:['Fixture courts'],federation_sanction_status:'pending'
        }});
        await auth.verifyContinuing();
        window.authorised.push(['${type}',organisation.id,editingEvent?.id,organisationClubs.map(row=>row.id)]);
        onSaved({eventId:editingEvent?.id||45});
      } catch (problem) {setError(problem.message);}
    };
    return <section><h2>${type} builder</h2><p>{organisation.name}</p>{weeklyDraft&&<p>Continuing {weeklyDraft.name} for {weeklyDraft.weeks} weeks</p>}
      {error&&<p role="alert">{error}</p>}
      <button onClick={confirm}>Save host event</button><button onClick={onClose}>Close host editor</button></section>;
  }
`;

async function click(page, label) {
  const button = await page.waitForFunction(text => [...document.querySelectorAll('button')].find(node => !node.disabled && node.textContent.trim() === text), {}, label);
  await button.asElement().click();
}

test('approved owner reaches the light host builders for the exact organisation and cannot save after revocation', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), '4m-organisation-host-'));
  let browser;
  try {
    const outfile = path.join(directory,'fixture.js');
    await build({
      stdin:{contents:fixture,loader:'jsx',resolveDir:process.cwd()}, bundle:true,format:'iife',platform:'browser',jsx:'automatic',
      outfile,define:{'import.meta.env':'{}'},
      plugins:[{name:'host-editors',setup(builder){
        builder.onResolve({filter:/\/(?:QuickEventBuilder|EventBuilder|EntityDecisionPanel|supabaseClient)(?:\.(?:jsx|js))?$/}, args=>({path:args.path.includes('supabaseClient')?'supabaseClient':args.path,namespace:'fixture'}));
        builder.onLoad({filter:/./,namespace:'fixture'},args=>{
          if (args.path.includes('supabaseClient')) return {contents:'export const supabase={};export const isSupabaseConfigured=()=>false;'};
          if (args.path.includes('EntityDecisionPanel')) return {contents:'export default ()=>null;'};
          return {contents:stubBuilder(args.path.includes('QuickEventBuilder')?'Quick':'Full'),loader:'jsx',resolveDir:process.cwd()};
        });
      }}],
    });
    browser=await puppeteer.launch({headless:true,protocolTimeout:20000,args:['--no-sandbox']});
    const open=async role=>{
      const page=await browser.newPage();
      page.setDefaultTimeout(8000);
      await page.setRequestInterception(true);
      page.on('request',request=>request.url()===fixtureUrl?request.respond({contentType:'text/html',body:'<main id="root"></main>'}):request.abort());
      await page.goto(fixtureUrl);
      await page.addStyleTag({path:path.join(directory,'fixture.css')});
      await page.addScriptTag({path:outfile});
      await page.evaluate(value=>window.render(value),role);
      await click(page,'View profile');
      return page;
    };
    const owner=await open('owner');
    try {
      await click(owner,'Open host events');
      await owner.waitForFunction(()=>document.body.innerText.includes('Home tournament')&&document.body.innerText.includes('Federation review pending'));
      assert.equal(await owner.evaluate(()=>document.body.innerText.includes('Other tenant event')),false);
      const hostEvents = await owner.evaluate(()=>document.body.innerText);
      assert.match(hostEvents, /Sanction declined\s+Rejection feedback\s+Submit the venue confirmation\./);
      assert.match(hostEvents, /Federation declined\s+Rejection feedback\s+Send the corrected draw format\./);
      assert.doesNotMatch(hostEvents, /Other tenant feedback|Stale feedback/);
      await click(owner,'Weekly drafts');
      await click(owner,'Continue draft');
      await owner.waitForFunction(()=>document.body.innerText.includes('Continuing Fixture social series for 5 weeks'));
      assert.deepEqual(await owner.evaluate(()=>window.calls.filter(([name])=>name==='admin_weekly_event_draft').map(([,args])=>args.p_host)),['org-a','org-a']);
      await click(owner,'Close host editor');
      await click(owner,'Create event');
      await owner.waitForFunction(()=>document.body.innerText.includes('Full builder'));
      await click(owner,'Save host event');
      await owner.waitForFunction(()=>window.authorised.length===1);
      await click(owner,'Close host editor');
      await click(owner,'Quick event');
      await owner.waitForFunction(()=>document.body.innerText.includes('Quick builder'));
      await click(owner,'Save host event');
      await owner.waitForFunction(()=>window.authorised.length===2);
      await click(owner,'Close host editor');
      await click(owner,'Edit event');
      await owner.waitForFunction(()=>document.body.innerText.includes('Full builder'));
      await click(owner,'Save host event');
      await owner.waitForFunction(()=>window.authorised.length===3);
      await click(owner,'Close host editor');
      await click(owner,'Edit quick event');
      await owner.waitForFunction(()=>document.body.innerText.includes('Quick builder'));
      await owner.evaluate(()=>{window.revoked=true;});
      await click(owner,'Save host event');
      await owner.waitForSelector('[role=alert]');
      assert.match(await owner.$eval('[role=alert]',node=>node.textContent), /Current organisation owner or admin/);
      assert.deepEqual(await owner.evaluate(()=>window.authorised), [['Full','org-a',null,['club-a']],['Quick','org-a',null,['club-a']],['Full','org-a',41,['club-a']]]);
      assert.deepEqual(await owner.evaluate(()=>[...new Set(window.calls.filter(([name])=>name==='admin_organisation_host_builder').map(([,args])=>args.p_organisation_id))]),['org-a']);
    } finally {await owner.close();}
    const staff=await open('staff');
    try {
      const controls = await staff.evaluate(()=>[...document.querySelectorAll('button')].map(node=>node.textContent.trim()));
      assert.equal(controls.includes('Open host events'),false);
      assert.equal(await staff.evaluate(()=>window.calls.some(([name])=>name==='admin_organisation_host_builder')),false);
    } finally {await staff.close();}
  } finally {
    await browser?.close();
    await rm(directory,{force:true,recursive:true});
  }
});
