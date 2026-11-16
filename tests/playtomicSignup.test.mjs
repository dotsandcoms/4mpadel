import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';

const root = process.cwd();
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), '4m-playtomic-signup-'));
let browser;
const mock = `
let session=null;window.__signups=0;window.__saves=[];window.__uploads=[];
const user={id:'00000000-0000-0000-0000-000000000003',email:'signup@example.test'};
export const supabase={auth:{
 async getSession(){return {data:{session}}},
 async signUp(){window.__signups++;session=window.__confirmEmail?null:{user};return {data:{user,session},error:null}},
 async signInWithPassword(){session={user};return {data:{user,session},error:null}},
},
 from(){const q={select(){return q},ilike(){return q},async maybeSingle(){return {data:null,error:null}}};return q},
 async rpc(name,args){if(name==='create_player_profile_with_details_v3'){window.__saves.push(args);if(window.__failSave){window.__failSave=false;return {error:{message:'Retry fixture'}}}}return {data:42,error:null}},
 functions:{async invoke(){if(window.__holdRead)await new Promise(resolve=>window.__finishRead=resolve);return {data:{status:'detected',level:5.17,matches:660,reliability_percent:93},error:null}}},
 storage:{from(bucket){return {async upload(file,bytes){window.__uploads.push({bucket,path:file,size:bytes.size});return {error:null}},async createSignedUrl(){return {data:{signedUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD6sAAAAASUVORK5CYII='},error:null}},getPublicUrl(){return {data:{publicUrl:'https://example.test/image'}}}}}}
};`;

before(async () => {
  await build({ stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter,useLocation}from'react-router-dom';import Auth from './src/components/AuthModal.jsx';function App(){const location=useLocation();return <><p id="route">{location.pathname}</p><Auth isOpen onClose={()=>window.__closed=true} initialTab={window.__login?'login':'register'} initialRegisterType="profile"/></>}createRoot(document.getElementById('root')).render(<MemoryRouter><App/></MemoryRouter>);`, resolveDir: root, loader: 'jsx' },
    outfile: path.join(temporary, 'fixture.js'), bundle: true, platform: 'browser', format: 'iife',
    define: { 'process.env.NODE_ENV': '"test"', 'import.meta.env.VITE_SUPABASE_URL': '"https://example.test"', 'import.meta.env.VITE_SUPABASE_ANON_KEY': '"test-key"' },
    plugins: [{ name: 'signup-fixture', setup(builder) {
      builder.onResolve({ filter: /supabaseClient$/ }, () => ({ path: 'supabase', namespace: 'fixture' }));
      builder.onResolve({ filter: /useClubs$/ }, () => ({ path: 'clubs', namespace: 'fixture' }));
      builder.onResolve({ filter: /SearchableSelect$/ }, () => ({ path: 'select', namespace: 'fixture' }));
      builder.onResolve({ filter: /RegisterOrganisationForm$|RegisterCoachForm$|ClubCreateWizard$/ }, () => ({ path: 'skip', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: {
        supabase: mock,
        clubs: "export const useClubs=()=>({clubs:[{id:'club-1',name:'Test Club'}]});",
        select: 'import React from "react";export default function Select({options,value,onChange}){return <select value={value} onChange={e=>onChange(e)}><option value="">Select club</option>{options.map(o=><option key={o.id||o.value} value={o.id||o.value}>{o.name||o.label}</option>)}</select>}',
        skip: 'export default function Empty(){return null}',
      }[args.path], loader: 'jsx', resolveDir: root }));
    } }], loader: { '.png': 'dataurl' } });
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); fs.rmSync(temporary, { recursive: true, force: true }); });

async function open(flags = {}) {
  const page = await browser.newPage();
  page.setDefaultTimeout(7000);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await page.setContent('<div id="root"></div>');
  await page.evaluate(flags => { Object.assign(window, flags); window.crypto.randomUUID = () => '00000000-0000-4000-8000-000000000004'; }, flags);
  await page.addScriptTag({ path: path.join(temporary, 'fixture.js') });
  await page.waitForSelector('form');
  return page;
}
async function fillStep(page) {
  await page.evaluate(() => {
    for (const input of document.querySelectorAll('form input[required], form textarea[required]')) {
      if (input.type === 'file' || input.type === 'checkbox') continue;
      const value = input.type === 'email' ? 'signup@example.test' : input.type === 'password' ? 'FixturePass1@' : input.type === 'date' ? '2000-02-29' : input.type === 'tel' ? '0000000000' : 'Test';
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value').set.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    for (const select of document.querySelectorAll('form select')) {
      select.value = [...select.options].find(o => o.value && !o.disabled).value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
}
async function reachPlaytomic(page) {
  await fillStep(page); await page.click('form button[type="submit"]');
  await page.waitForFunction(() => document.body.textContent.includes('Step 2: Padel Profile'));
  await fillStep(page); await page.click('#acceptTerms'); await page.click('form button[type="submit"]');
}

test('web signup requires screenshot or no-profile confirmation; retries reuse the account', async () => {
  const page = await open({ __failSave: true });
  try {
    await reachPlaytomic(page);
    await page.waitForSelector('[name="playtomic_level"]');
    assert.equal(await page.evaluate(() => window.__signups), 1);
    await page.click('form button[type="submit"]');
    assert.equal(await page.evaluate(() => window.__saves.length), 0);
    await page.type('[name="playtomic_level"]', '0');
    await page.click('form button[type="submit"]');
    assert.equal(await page.evaluate(() => window.__saves.length), 0);
    await page.click('[name="playtomic_no_profile"]');
    assert.equal(await page.$('[name="playtomic_level"]'), null);
    await page.click('form button[type="submit"]');
    await page.waitForFunction(() => document.body.textContent.includes('failed to setup profile'));
    await page.click('form button[type="submit"]');
    await page.waitForFunction(() => window.__saves.length === 2);
    assert.equal(await page.evaluate(() => window.__signups), 1);
    const saved = await page.evaluate(() => window.__saves[1].p_details);
    assert.deepEqual(saved, { date_of_birth: '2000-02-29', playtomic_no_profile:true, playtomic_level: null, playtomic_proof_path: null });
  } finally { await page.close(); }
});

test('web signup automatically fills the level after private screenshot upload', async () => {
  const page = await open({ __holdRead: true });
  try {
    await reachPlaytomic(page); await page.waitForSelector('[name="playtomic_proof"]');
    const file = path.join(temporary, 'screenshot.png');
    fs.writeFileSync(file, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD6sAAAAASUVORK5CYII=', 'base64'));
    await (await page.$('[name="playtomic_proof"]')).uploadFile(file);
    await page.waitForFunction(() => document.querySelector('dialog[open]')?.textContent.includes('We’re extracting your Playtomic level'));
    assert.equal(await page.$eval('dialog[open]', dialog => dialog.contains(document.activeElement)), true);
    assert.equal(await page.$eval('[name="playtomic_level"]', e => e.value), '');
    if (process.env.PLAYTOMIC_QA_OUTPUT) {
      const stylesheet = fs.readdirSync('dist/assets').find(name => /^index-.*\.css$/.test(name));
      await page.addStyleTag({ path: path.join(root, 'dist/assets', stylesheet) });
      await page.$eval('[name="playtomic_level"]', e => e.closest('fieldset').scrollIntoView({block:'end'}));
      await page.screenshot({ path: process.env.PLAYTOMIC_QA_OUTPUT.replace(/\.png$/, '-processing.png') });
    }
    await page.evaluate(() => window.__finishRead());
    await page.waitForFunction(() => document.querySelector('[name="playtomic_level"]').value === '5.17');
    assert.ok(await page.$('dialog[open] [data-testid="extraction-success"]'));
    assert.match(await page.$eval('dialog[open]', e => e.textContent), /5.17.*660.*93%/);
    if(process.env.PLAYTOMIC_QA_OUTPUT) await page.screenshot({path:process.env.PLAYTOMIC_QA_OUTPUT.replace(/\.png$/, '-success.png')});
    const successStarted=Date.now();
    await page.waitForSelector('dialog[open]', {hidden:true});
    assert.ok(Date.now()-successStarted >= 1500, 'success remains visible for approximately two seconds');
    const upload = await page.evaluate(() => window.__uploads[0]);
    assert.equal(upload.bucket, 'playtomic-proofs');
    assert.match(upload.path, /^signup\/00000000-0000-0000-0000-000000000003\/[a-f0-9-]+\.png$/);
    assert.equal(await page.$eval('[name="playtomic_level"]', e => e.value), '5.17');
    if (process.env.PLAYTOMIC_QA_OUTPUT) {
      const stylesheet = fs.readdirSync('dist/assets').find(name => /^index-.*\.css$/.test(name));
      await page.addStyleTag({ path: path.join(root, 'dist/assets', stylesheet) });
      await page.screenshot({ path: process.env.PLAYTOMIC_QA_OUTPUT });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    assert.equal(await page.$eval('[name="playtomic_level"]', e => e.value), '5.17');
    await page.click('form button[type="submit"]');
    await page.waitForFunction(() => window.__saves.length === 1);
    assert.equal(await page.evaluate(() => window.__saves[0].p_details.playtomic_proof_path), upload.path);
  } finally { await page.close(); }
});

test('email confirmation does not repeatedly create an account', async () => {
  const page = await open({ __confirmEmail: true });
  try {
    await reachPlaytomic(page);
    await page.waitForFunction(() => document.body.textContent.includes('Confirm your email'));
    await page.click('form button[type="submit"]');
    await page.waitForFunction(() => !document.querySelector('form button[type="submit"]').disabled);
    assert.equal(await page.evaluate(() => window.__signups), 1);
    assert.equal(await page.evaluate(() => window.__saves.length), 0);
  } finally { await page.close(); }
});

test('signing into an unfinished account resumes profile completion', async () => {
  const page = await open({ __login: true });
  try {
    await fillStep(page); await page.click('form button[type="submit"]');
    await page.waitForFunction(() => document.querySelector('#route').textContent === '/profile');
    assert.equal(await page.evaluate(() => window.__closed), true);
    assert.equal(await page.evaluate(() => window.__signups), 0);
  } finally { await page.close(); }
});
