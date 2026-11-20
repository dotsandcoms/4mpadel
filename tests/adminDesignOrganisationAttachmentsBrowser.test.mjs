import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';

const fixtureUrl = 'http://host-assets.fixture.invalid/';
const contents = String.raw`
  import { createRoot } from 'react-dom/client';
  import EventBuilder from './src/components/admin/EventBuilder.jsx';
  import QuickEventBuilder from './src/components/admin/QuickEventBuilder.jsx';
  import { supabase } from './src/supabaseClient';
  import './src/pages/AdminPreview.css';

  const host={id:'11111111-1111-1111-1111-111111111111',name:'Fixture Organisation'};
  const division={id:'own-division',event_id:41,name:'Open',format:'Americano',entry_fee:0};
  window.requests=[];
  window.saved=[];
  window.toasts=[];
  window.renderBuilder=quick=>{
    const actual={id:41,event_name:'Fixture Tournament',organisation_id:host.id,organiser_name:host.name,
      club_id:null,is_manual:true,is_quick_event:quick,event_status:'active',start_date:'2035-03-09',end_date:'2035-03-09',
      start_time:'09:00',end_time:'11:00',registration_closes_at:'2035-03-07T12:00:00Z',
      venue:'Fixture pavilion',venues:['Fixture pavilion'],city:'Fixture city',slug:'fixture-tournament',payment_method:'free',
      registration_access:'public',max_players:8,max_teams_capacity:8,
      ...(quick ? {_quickDivision:division,custom_image_url:'https://stored.fixture.invalid/existing-poster.jpg'} : {}),
    };
    Object.assign(supabase,{
      auth:{getUser:async()=>({data:{user:{id:'fixture',email:'host@example.invalid'}}})},
      from(table){
        let rows=table==='calendar'?[actual]:table==='tournament_divisions'?[division]:table==='organisations'?[host]:[];
        let update;
        const q={
          select(){return q;},eq(key,value){rows=rows.filter(row=>row[key]===value);return q;},is(key,value){return q.eq(key,value);},
          in(){return q;},order(){return q;},limit(){return q;},abortSignal(){return q;},
          update(value){update=value;return q;},insert(){return q;},
          then(resolve){return Promise.resolve({data:rows}).then(resolve);},
          single(){if(table==='calendar'&&update&&rows[0])window.saved.push(update);return Promise.resolve({data:rows[0]||null});},
          maybeSingle(){return q.single();},
        };return q;
      },
      functions:{async invoke(name,{body}){
        const kind=body.get('kind'),org=body.get('organisation_id'),event=body.get('event_id');
        const file=body.get('file');
        window.requests.push([name,org,event,kind,file.name]);
        if (window.blockUpload) return {error:{context:new Response(JSON.stringify({message:'Current owner or admin access is required.'}),{status:403})}};
        const contentType=file.type,ext=contentType==='application/pdf'?'pdf':'png';
        return {data:{organisationId:org,eventId:Number(event),kind,contentType,
          url:'https://storage.fixture.invalid/storage/v1/object/public/organisation-event-attachments/organisations/'+org+'/events/'+event+'/'+kind+'/'+window.requests.length+'.'+ext}};
      }},
    });
    const Builder=quick?QuickEventBuilder:EventBuilder;
    createRoot(document.getElementById('root')).render(<Builder isOpen theme="preview" organisation={host} organisationClubs={[]} editingEvent={actual}
      beforeSave={async()=>({verifyContinuing:async()=>{}})} onClose={()=>{}}/>);
  };
`;

async function click(page, label) {
  await page.waitForFunction(label => [...document.querySelectorAll('button')]
    .some(node => !node.disabled && (node.getAttribute('aria-label') || node.textContent).trim() === label), {}, label);
  await page.evaluate(label => [...document.querySelectorAll('button')]
    .find(node => !node.disabled && (node.getAttribute('aria-label') || node.textContent).trim() === label).click(), label);
}
async function sendFiles(page, label, files) {
  await page.waitForFunction(label => [...document.querySelectorAll('label')].some(node => node.textContent.includes(label) && node.querySelector('input[type=file]:not(:disabled)')), {}, label);
  await page.evaluate((label, files) => {
    const input = [...document.querySelectorAll('label')].find(node => node.textContent.includes(label) && node.querySelector('input[type=file]:not(:disabled)')).querySelector('input');
    const data = new DataTransfer();
    for (const [name, type] of files) data.items.add(new File(['Browser routing fixture'], name, { type }));
    input.files = data.files;
    input.dispatchEvent(new Event('change', { bubbles:true }));
  }, label, files);
}

test('full and quick host builders upload scoped assets and save removals as event-field changes', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), '4m-organisation-assets-'));
  let browser;
  try {
    const outfile = path.join(directory, 'fixture.js');
    await build({
      stdin: { contents, loader: 'jsx', resolveDir: process.cwd() }, bundle: true, format: 'iife', platform: 'browser', jsx: 'automatic',
      outfile, define: { 'import.meta.env': '{}' },
      plugins: [{ name: 'synthetic-assets', setup(builder) {
        builder.onResolve({ filter: /(?:^sonner$|\/(?:supabaseClient|useAdminPermissions)(?:\.(?:js|jsx))?$)/ }, args => ({
          path: args.path.includes('supabaseClient') ? 'client' : args.path.includes('useAdminPermissions') ? 'permissions' : 'toast',
          namespace: 'fixture',
        }));
        builder.onLoad({ filter: /./, namespace: 'fixture' }, args => ({ contents: {
          client: 'export const supabase={};export const isSupabaseConfigured=()=>true;',
          permissions: 'export const useAdminPermissions=()=>({permissions:{role:"org_owner"}});',
          toast: 'export const toast=new Proxy({}, {get:(_obj,name)=>(message)=>window.toasts?.push([name,message])});',
        }[args.path] }));
      } }],
    });
    browser = await puppeteer.launch({ headless:true, protocolTimeout:20000, args:['--no-sandbox'] });
    const open = async quick => {
      const page = await browser.newPage();
      page.setDefaultTimeout(8000);
      await page.setRequestInterception(true);
      page.on('request', request => request.url() === fixtureUrl
        ? request.respond({contentType:'text/html',body:'<main id="root"></main>'}) : request.abort());
      await page.goto(fixtureUrl);
      await page.addStyleTag({path:path.join(directory,'fixture.css')});
      await page.addScriptTag({path:outfile});
      await page.evaluate(quick => { window.confirm = () => true; window.renderBuilder(quick); }, quick);
      return page;
    };
    const full = await open(false);
    try {
      await click(full, 'Media & Branding');
      await full.waitForFunction(() => !document.querySelector('[inert]'));
      if (!await full.evaluate(() => document.body.textContent.includes('Upload Poster'))) await click(full,'Event Media');
      await sendFiles(full, 'Upload Poster', [['fixture.pdf','application/pdf']]);
      await click(full, 'Remove poster');
      await click(full, 'Optional Event Assets');
      await sendFiles(full, 'Upload PDF or DOCX', [['instructions.pdf','application/pdf']]);
      await full.waitForSelector('a[href*="/organiser-kit/"]');
      await sendFiles(full, 'Add images', [['a.png','image/png'],['b.png','image/png']]);
      await full.waitForSelector('img[alt="Event gallery 2"]');
      await click(full, 'Remove event gallery image 1');
      await sendFiles(full, 'Upload main', [['sponsor.png','image/png']]);
      await full.waitForSelector('img[alt="Main sponsor"]');
      await click(full, 'Remove main sponsor logo');
      await full.evaluate(() => { window.blockUpload = true; });
      await sendFiles(full, 'Upload main', [['wrong-tenant.png','image/png']]);
      await full.waitForFunction(() => window.toasts.some(([kind,message])=>kind==='error'&&message.includes('Current owner')));
      assert.equal(await full.$('img[alt="Main sponsor"]'), null);
      await click(full, 'Save draft');
      await full.waitForFunction(() => window.saved.length===1);
      const { payload, requests } = await full.evaluate(() => ({payload:window.saved[0],requests:window.requests}));
      assert.equal(payload.poster_document_url, null);
      assert.match(payload.organiser_kit_url, /\/organiser-kit\//);
      assert.deepEqual(payload.sponsor_logos, []);
      assert.equal(payload.media_gallery_urls.length, 1);
      assert.deepEqual(requests.map(row=>row[3]), ['poster','organiser-kit','gallery','gallery','sponsor','sponsor']);
      assert.ok(requests.every(row=>row[0]==='organisation-event-attachments'&&row[1]==='11111111-1111-1111-1111-111111111111'&&row[2]==='41'));
    } catch (error) {
      error.message += '\nFull builder screen: '+await full.evaluate(()=>JSON.stringify(window.toasts)+' '+document.body.innerText.slice(-4500));
      throw error;
    } finally { await full.close(); }

    const quick = await open(true);
    try {
      await click(quick, 'Media & prizes');
      await sendFiles(quick, 'Sponsor logo', [['quick-logo.png','image/png']]);
      await click(quick, 'Remove sponsor logo');
      await click(quick, 'Remove event poster');
      await click(quick, 'Review & save');
      await click(quick, 'Save quick event');
      await quick.waitForFunction(() => window.saved.length===1);
      const {payload,requests} = await quick.evaluate(() => ({payload:window.saved[0],requests:window.requests}));
      assert.deepEqual(payload.sponsor_logos, []);
      assert.equal(payload.custom_image_url, null);
      assert.deepEqual(requests.map(row=>row[3]), ['sponsor']);
    } catch (error) {
      error.message += '\nQuick builder screen: '+await quick.evaluate(()=>JSON.stringify(window.toasts)+' '+document.body.innerText.slice(-4500));
      throw error;
    } finally { await quick.close(); }
  } finally {
    await browser?.close();
    await rm(directory,{recursive:true,force:true});
  }
});
