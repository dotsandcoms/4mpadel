import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';
import { ageFromBirthDate } from '../src/utils/profileDetails.js';

const root = process.cwd();
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), '4m-admin-player-editor-'));
const output = path.join(temporary, 'fixture.js');
let browser;
const mock = `
const sample=(id,name)=>({id,name,email:'sample'+id+'@example.com',contact_number:'0000000000',points:0,win_rate:0,age:35,category:"Men's Advanced",region:'Eastern Cape',gender:'Male',racket_brand:'Nox',approved:true,paid_registration:false,license_type:'none',id_number:'0012345678901',instagram_link:'@sample',playing_hand:'left',court_side:'right',bio:'Sample biography',sponsors:'["Sample Sponsor"]',additional_images:'["https://example.com/gallery.jpg"]'});
const tables={players:[sample(111,'Sample One'),sample(222,'Sample Two')],payments:[]};
const details={111:{date_of_birth:'1990-02-01',playtomic_level:3.25,playtomic_extracted_level:3.25,playtomic_matches:100,playtomic_reliability_percent:80,playtomic_extracted_at:'2026-11-05T00:00:00Z',playtomic_proof_path:'111/00000000-0000-4000-8000-000000000001.jpg'},222:{date_of_birth:'2000-03-04',playtomic_level:null,playtomic_proof_path:null}};
if(window.__mode==='legacy')details[111]=null;
window.__reads=[];window.__writes=[];window.__tables=tables;window.__details=details;window.__storage=[];
export const supabase={
 functions:{async invoke(name,args){window.__reads.push({name,args});if(window.__holdRead)await new Promise(resolve=>window.__finishRead=resolve);if(window.__readError)return {data:null,error:{}};return {data:{status:'detected',level:window.__readResult===undefined?5.17:window.__readResult,matches:660,reliability_percent:93},error:null}}},
 async rpc(name,args){
  if(name==='get_player_profile_details'){
   if(window.__mode==='read-error')return {data:null,error:{message:'Access denied'}};
   const value=structuredClone(details[args.p_player_id]||null);
   if(window.__deferRead&&args.p_player_id===111)await new Promise(resolve=>window.__releaseRead=resolve);
   return {data:value,error:null};
  }
  if(name==='save_player_profile_details_v3'){
   window.__writes.push({type:'private',name,args});
   if(window.__mode==='save-error')return {data:null,error:{message:'Private save denied'}};
   details[args.p_player_id]=structuredClone(args.p_details);return {data:structuredClone(args.p_details),error:null};
  }
  throw new Error('Unexpected RPC '+name);
 },
 storage:{from(bucket){return {
  async createSignedUrl(file){window.__storage.push({type:'signed',bucket,path:file});return {data:{signedUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD6sAAAAASUVORK5CYII='},error:null}},
  async upload(file,data){window.__storage.push({type:'upload',bucket,path:file,size:data.size});if(window.__holdUpload)await new Promise(resolve=>window.__finishUpload=resolve);return {error:null}},
  getPublicUrl(file){return {data:{publicUrl:'https://example.com/'+file}}},
  async remove(files){window.__storage.push({type:'remove',bucket,paths:files});return {error:null}}
 }}},
 from(table){let filters=[],operation='select',values;
  const execute=(from=0,to=Infinity)=>{let rows=(tables[table]||[]).filter(r=>filters.every(f=>f(r)));
   if(operation==='update'){
    window.__writes.push({type:'public',table,values,ids:rows.map(r=>r.id)});
    if(window.__mode==='public-error')return {data:null,error:{message:'Public save denied'}};
    rows.forEach(r=>Object.assign(r,values));
   }
   if(operation==='insert'){rows=values.map((v,i)=>({...v,id:333+i}));tables[table].push(...rows);window.__writes.push({type:'public',operation,table,values});}
   return {data:structuredClone(rows.slice(from,to+1)),error:null};};
  const q={select(){return q},order(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},in(k,v){filters.push(r=>v.includes(r[k]));return q},update(v){operation='update';values=v;return q},insert(v){operation='insert';values=v;return q},async range(f,t){return execute(f,t)},async single(){const r=execute();return {...r,data:r.data?.[0]||null}},then(resolve,reject){return Promise.resolve(execute()).then(resolve,reject)}};return q;
 }
};`;

before(async () => {
    await build({ stdin: { contents: "import React from 'react';import{createRoot}from'react-dom/client';import Manager from './src/components/admin/PlayerManager.jsx';createRoot(document.getElementById('root')).render(<Manager/>);", resolveDir: root, loader: 'jsx' }, outfile: output, bundle: true, platform: 'browser', format: 'iife', define: { 'process.env.NODE_ENV': '"test"' },
        plugins: [{ name: 'admin-profile-fixture', setup(builder) {
            builder.onResolve({ filter: /supabaseClient$/ }, () => ({ path: 'supabase', namespace: 'fixture' }));
            builder.onResolve({ filter: /useClubs$/ }, () => ({ path: 'clubs', namespace: 'fixture' }));

            builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: {
                supabase: mock, clubs: "const clubs=[{id:'club-1',name:'Sample Club'}];export const useClubs=()=>({clubs,loading:false});",
                select: 'import React from "react";export default function Select({options,value,onChange}){return <select aria-label="Home club" value={value} onChange={e=>onChange(e.target.value)}><option value="">Select club</option>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>}',
            }[args.path], loader: 'jsx', resolveDir: root }));
        } }], loader: { '.png': 'dataurl' } });
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); fs.rmSync(temporary, { recursive: true, force: true }); });

async function open(mode = '', width = 1200) {
    const page = await browser.newPage();
    page.setDefaultTimeout(7000);
    await page.setViewport({ width, height: 1000 });
    await page.setContent('<!doctype html><html><body style="background:#0a0a0a"><div id="root"></div></body></html>');
    await page.evaluate(mode => { window.__mode = mode; if(!crypto.randomUUID)Object.defineProperty(crypto,'randomUUID',{value:()=> '00000000-0000-4000-8000-'+String(window.__uuidSeq=(window.__uuidSeq||1)+1).padStart(12,'0')}); Object.defineProperty(window, 'localStorage', { value: { getItem: () => 'false', setItem() {} } }); }, mode);
    const assets = path.join(root, 'dist/assets');
    if (fs.existsSync(assets)) { const css = fs.readdirSync(assets).find(f => /^index-.*\.css$/.test(f)); if (css) { await page.addStyleTag({ content: fs.readFileSync(path.join(assets, css), 'utf8') }); await page.evaluate(() => window.__hasAppStyles=true); } }
    await page.addScriptTag({ path: output });
    await page.waitForSelector('button[aria-label="Edit Sample One"]');
    await page.click('button[aria-label="Edit Sample One"]');
    await page.waitForSelector('[role="dialog"]');
    if (mode !== 'read-error') await page.waitForFunction(() => !document.querySelector('[role="dialog"] button[type="submit"]').disabled);
    return page;
}
const fill = (page, selector, value) => page.$eval(selector, (input, value) => {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value').set;
    setter.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
}, value);
const save = async page => { await page.waitForSelector('dialog[open]',{hidden:true}); await page.click('[role="dialog"] button[type="submit"]'); };
const value = (page, name) => page.$eval(`[name="${name}"]`, e => e.value);

test('admin editor loads all self-editable fields and saves public/private data for the selected player', async () => {
    const page = await open();
    try {
        const fields = ['name','email','contact_number','nationality','gender','bio','sponsors','category','id_number','instagram_link','playing_hand','court_side','date_of_birth','calculated_age','playtomic_level','playtomic_proof','gallery_photos','image_url'];
        // Existing static controls have visible labels; newly shared fields have stable names.
        for (const name of fields) assert.ok(await page.$(`[name="${name}"]`), name);
        assert.equal(await value(page, 'date_of_birth'), '1990-02-01');
        assert.equal(await value(page, 'playtomic_level'), '3.25');
        assert.equal(await value(page, 'playing_hand'), 'left');
        assert.equal(await value(page, 'id_number'), '0012345678901');
        await fill(page, '[name="date_of_birth"]', '1991-04-05');
        await fill(page, '[name="playtomic_level"]', '0');
        await fill(page, '[name="instagram_link"]', '@updated');
        await page.select('[name="court_side"]', 'either');
        await page.click('button[aria-label="Home club"]');
        await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] button')].find(b=>b.textContent.trim()==='Sample Club').click());
        await save(page);
        await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
        const writes = await page.evaluate(() => window.__writes);
        assert.equal(writes[0].type, 'private'); assert.equal(writes[0].args.p_player_id, 111);
        assert.deepEqual(writes[0].args.p_details, { date_of_birth:'1991-04-05',playtomic_no_profile:false,playtomic_level:0,playtomic_proof_path:'111/00000000-0000-4000-8000-000000000001.jpg' });
        assert.equal(writes[1].type, 'public'); assert.deepEqual(writes[1].ids, [111]);
        assert.equal(writes[1].values.instagram_link, '@updated'); assert.equal(writes[1].values.court_side, 'either');
        assert.equal(writes[1].values.age, ageFromBirthDate('1991-04-05'));
        assert.equal(writes[1].values.club_id, 'club-1'); assert.equal(writes[1].values.home_club, 'Sample Club');
        assert.equal('date_of_birth' in writes[1].values, false); assert.equal('playtomic_proof_path' in writes[1].values, false);
        assert.equal(await page.evaluate(() => window.__tables.players[1].instagram_link), '@sample');
    } finally { await page.close(); }
});

test('legacy profiles retain saved age but require a level and birth date before profile saving', async () => {
    const page = await open('legacy');
    try {
        assert.equal(await value(page, 'calculated_age'), '35');
        await fill(page, '[name="contact_number"]', '0000000001'); await save(page);
        assert.equal(await page.evaluate(() => window.__writes.length), 0);
        assert.equal(await page.$eval('[name="playtomic_level"]', e => e.validity.valueMissing), true);
        await fill(page, '[name="playtomic_level"]', '0');
        await fill(page, '[name="date_of_birth"]', '2000-02-29');
        await save(page);
        assert.equal(await page.evaluate(() => window.__writes.length),0);
        await page.click('[name="playtomic_no_profile"]');
        await save(page);
        await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
        const writes = await page.evaluate(() => window.__writes);
        assert.equal(writes[0].type, 'private');
        assert.equal(writes[0].args.p_details.playtomic_level, null);
        assert.equal(writes[0].args.p_details.playtomic_no_profile,true);
        assert.equal(writes[0].args.p_details.playtomic_proof_path, null);
        assert.equal(writes[1].type, 'public');
    } finally { await page.close(); }
});

test('private read failure blocks saving and retry loads the actual data', async () => {
    const page = await open('read-error');
    try {
        await page.waitForSelector('[role="alert"]');
        assert.equal(await page.$eval('[role="dialog"] button[type="submit"]', e => e.disabled), true);
        await page.evaluate(() => { window.__mode=''; [...document.querySelectorAll('button')].find(b=>b.textContent==='Retry private details').click(); });
        await page.waitForFunction(() => document.querySelector('[name="date_of_birth"]').value==='1990-02-01');
        assert.equal(await page.evaluate(() => window.__writes.length), 0);
    } finally { await page.close(); }
});

test('failed private save leaves the editor open and never overwrites public player fields', async () => {
    const page = await open('save-error');
    try {
        await fill(page, '[name="date_of_birth"]', '1991-04-05'); await save(page);
        await page.waitForSelector('[role="dialog"] [role="alert"]');
        assert.match(await page.$eval('[role="alert"]', e => e.textContent), /Private save denied/);
        assert.equal(await page.evaluate(() => window.__writes.some(w=>w.type==='public')), false);
    } finally { await page.close(); }
});

test('proof is uploaded under the player ID, previewed privately and saved before old proof is removed', async () => {
    const page = await open();
    try {
        await page.evaluate(() => window.__holdUpload=true);
        const input = await page.$('input[name="playtomic_proof"]');
        await input.uploadFile(path.join(root, 'src/assets/logo_4m_lowercase.png'));
        await page.waitForFunction(() => window.__finishUpload);
        assert.equal(await page.$eval('[role="dialog"] button[type="submit"]', e => e.disabled), true);
        const upload = await page.evaluate(() => window.__storage.find(s=>s.type==='upload'));
        assert.equal(upload.bucket, 'playtomic-proofs'); assert.match(upload.path, /^111\/[a-f0-9-]+\.png$/);
        await page.evaluate(() => window.__finishUpload());
        await page.waitForFunction(() => !document.querySelector('[role="dialog"] button[type="submit"]').disabled);
        await save(page); await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
        assert.equal(await page.evaluate(() => window.__writes[0].args.p_details.playtomic_proof_path), upload.path);
        assert.deepEqual(await page.evaluate(() => window.__storage.find(s=>s.type==='remove').paths), ['111/00000000-0000-4000-8000-000000000001.jpg']);
    } finally { await page.close(); }
});

test('a delayed response for a closed player editor cannot populate another player', async () => {
    const page = await open();
    try {
        await page.click('button[aria-label="Close player editor"]');
        await page.waitForSelector('[role="dialog"]', {hidden:true});
        await page.evaluate(() => window.__deferRead=true);
        await page.click('button[aria-label="Edit Sample One"]');
        await page.waitForFunction(() => window.__releaseRead);
        await page.click('button[aria-label="Close player editor"]');
        await page.waitForSelector('[role="dialog"]', {hidden:true});
        await page.click('button[aria-label="Edit Sample Two"]');
        await page.waitForFunction(() => document.querySelector('[name="date_of_birth"]').value==='2000-03-04');
        await page.evaluate(() => window.__releaseRead());
        assert.equal(await value(page, 'date_of_birth'), '2000-03-04');
    } finally { await page.close(); }
});

test('gallery changes persist with the rest of the profile and the mobile modal fits the viewport', async context => {
    const page = await open('', 390);
    try {
        await page.click('button[aria-label="Remove gallery photo 1"]');
        const input = await page.$('input[name="gallery_photos"]');
        await input.uploadFile(path.join(root, 'src/assets/logo_4m_lowercase.png'));
        await page.waitForFunction(() => window.__storage.some(s=>s.type==='upload'&&s.bucket==='profile-pics')&&!document.querySelector('[role="dialog"] button[type="submit"]').disabled);
        if (await page.evaluate(() => window.__hasAppStyles)) {
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth<=window.innerWidth), true);
        const box = await page.$eval('[role="dialog"]', e => ({width:e.clientWidth,scroll:e.scrollWidth})); assert.ok(box.scroll<=box.width);
        await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('[role="dialog"]')).opacity) >= 0.99 && Number(getComputedStyle(document.querySelector('[role="dialog"]').parentElement).opacity) >= 0.99);
        await page.screenshot({path:'/tmp/4m-admin-player-editor-mobile.png',fullPage:true});
        } else context.diagnostic('Production CSS unavailable; run npm run build to include the viewport checks.');
        await save(page); await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
        const write = await page.evaluate(() => window.__writes.find(w=>w.type==='public'));
        const images = JSON.parse(write.values.additional_images); assert.equal(images.length,1); assert.match(images[0], /111_gallery_/);
    } finally { await page.close(); }
});


test('a partial save reports the saved private details and retry finishes the public update without another private write', async () => {
    const page = await open('public-error');
    try {
        await fill(page, '[name="date_of_birth"]', '1991-04-05'); await save(page);
        await page.waitForSelector('[role="dialog"] [role="alert"]');
        assert.match(await page.$eval('[role="dialog"] [role="alert"]', e => e.textContent), /Private details were saved/);
        await page.evaluate(() => window.__mode='');
        await save(page); await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
        assert.equal(await page.evaluate(() => window.__writes.filter(w=>w.type==='private').length), 1);
        assert.equal(await page.evaluate(() => window.__writes.filter(w=>w.type==='public').length), 2);
    } finally { await page.close(); }
});


const uploadScreenshot = async page => {
    await (await page.$('[name="playtomic_proof"]')).uploadFile(path.join(root, 'src/assets/logo_4m_lowercase.png'));
    await page.waitForFunction(() => window.__reads.length > 0);
};

test('new screenshot uploads automatically fill the level without read or confirmation steps', async () => {
    const page = await open();
    try {
        assert.equal(await page.evaluate(() => window.__reads.length), 0, 'saved screenshot is not reprocessed');
        await page.evaluate(() => window.__holdRead=true);
        await uploadScreenshot(page);
        await page.waitForFunction(() => document.querySelector('dialog[open]')?.textContent.includes('We’re extracting your Playtomic level'));
        assert.equal(await page.$eval('dialog[open]', dialog => dialog.contains(document.activeElement)), true);
        assert.equal(await page.$eval('[role="dialog"] button[type="submit"]', e => e.disabled), true);
        await page.evaluate(() => window.__finishRead());
        await page.waitForFunction(() => document.querySelector('[name="playtomic_level"]').value === '5.17');
        assert.ok(await page.$('dialog[open] [data-testid="extraction-success"]'));
        assert.match(await page.$eval('dialog[open]', e=>e.textContent), /5.17.*660.*93%/);
        await page.waitForSelector('dialog[open]',{hidden:true});
        assert.equal(await page.evaluate(() => window.__reads.length), 1);
        assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].some(b => /Read level from screenshot|Use 5.17|Dismiss/.test(b.textContent))), false);
        await fill(page, '[name="playtomic_level"]', '5.12');
        await save(page);
        await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
        assert.equal(await page.evaluate(() => window.__writes[0].args.p_details.playtomic_level), 5.12);
    } finally { await page.close(); }
});

test('manual edits made while a screenshot is processing are preserved', async () => {
    const page = await open();
    try {
        await page.evaluate(() => window.__holdRead=true);
        await uploadScreenshot(page);
        await page.waitForFunction(() => !!window.__finishRead);
        await page.$eval('dialog[open] button', button => button.click());
        await page.waitForFunction(() => !document.querySelector('dialog[open]'));
        await fill(page, '[name="playtomic_level"]', '4.75');
        await page.evaluate(() => window.__finishRead());
        await page.waitForFunction(() => document.body.textContent.includes('Your edited level was kept.'));
        assert.equal(await value(page, 'playtomic_level'), '4.75');
    } finally { await page.close(); }
});

test('removed and replaced screenshots cannot fill the level from an obsolete response', async () => {
    for (const replace of [false, true]) {
        const page = await open();
        try {
            await page.evaluate(() => window.__holdRead=true);
            await uploadScreenshot(page);
            await page.waitForFunction(() => !!window.__finishRead);
            await page.evaluate(() => {window.__finishOldRead=window.__finishRead;});
            await page.$eval('dialog[open] button', button => button.click());
            await page.waitForFunction(() => !document.querySelector('dialog[open]'));
            if (replace) {
                await uploadScreenshot(page);
                await page.waitForFunction(() => window.__reads.length === 2);
            } else {
                await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === 'Remove screenshot').click());
            }
            await page.evaluate(() => window.__finishOldRead());
            assert.equal(await value(page, 'playtomic_level'), '3.25');
            if (replace) {
                await page.evaluate(() => window.__finishRead());
                await page.waitForFunction(() => document.querySelector('[name="playtomic_level"]').value === '5.17');
            } else {
                await save(page);
                assert.equal(await page.evaluate(() => window.__writes.length), 0, 'removed screenshot is required');
                await page.click('[name="playtomic_no_profile"]');
                await save(page);
                await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
                assert.equal(await page.evaluate(() => window.__writes[0].args.p_details.playtomic_proof_path), null);
            }
        } finally { await page.close(); }
    }
});

test('failed automatic reading keeps the manual level and offers a retry; zero fills correctly', async () => {
    const page = await open();
    try {
        await page.evaluate(() => window.__readError=true);
        await uploadScreenshot(page);
        await page.waitForFunction(() => document.body.textContent.includes('Retry reading screenshot'));
        assert.equal(await value(page, 'playtomic_level'), '3.25');
        await page.evaluate(() => { window.__readError=false;window.__readResult=0;[...document.querySelectorAll('button')].find(b => b.textContent === 'Retry reading screenshot').click(); });
        await page.waitForFunction(() => document.querySelector('[name="playtomic_level"]').value === '0');
    } finally { await page.close(); }
});


test('processing popup supports Escape and keyboard focus without closing the profile editor', async () => {
    const page = await open();
    try {
        await page.evaluate(() => window.__holdRead=true);
        await uploadScreenshot(page);
        await page.waitForSelector('dialog[open]');
        await page.keyboard.press('Tab');
        assert.equal(await page.$eval('dialog[open]', dialog => dialog.contains(document.activeElement)), true);
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.querySelector('dialog[open]'));
        assert.ok(await page.$('[role="dialog"]'));
        assert.equal(await page.$eval('[role="dialog"] button[type="submit"]', button => button.disabled), true);
        await page.evaluate(() => window.__finishRead());
        await page.waitForFunction(() => document.querySelector('[name="playtomic_level"]').value === '5.17');
        assert.ok(await page.$('[role="dialog"]'));
    } finally { await page.close(); }
});

test('saved screenshot metrics reload privately and no-profile declaration clears them',async()=>{
 const page=await open();
 try {
  assert.match(await page.$eval('fieldset',e=>e.textContent),/Matches: 100.*Level reliability: 80%/);
  assert.equal(await page.evaluate(()=>window.__reads.length),0);
  await page.click('[name="playtomic_no_profile"]');
  assert.equal(await page.$('[name="playtomic_proof"]'),null);
  assert.equal(await page.$('[name="playtomic_level"]'),null);
  await save(page);await page.waitForFunction(()=>!document.querySelector('[role="dialog"]'));
  const data=await page.evaluate(()=>window.__writes[0].args.p_details);
  assert.equal(data.playtomic_no_profile,true);assert.equal(data.playtomic_level,null);assert.equal(data.playtomic_proof_path,null);
  assert.equal('playtomic_matches' in data,false);
 }finally{await page.close()}
});
