import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {build} from 'esbuild';
import puppeteer from 'puppeteer';
const root=process.cwd(),temporary=fs.mkdtempSync(path.join(os.tmpdir(),'4m-mfa-accounts-')),outputs={events:path.join(temporary,'events.js'),help:path.join(temporary,'help.js')};
let browser;
const mock=`
let account={id:'first',email:'first@example.test',factor:'first-factor'},callback;
window.__changeAccount=next=>{account=next;callback('SIGNED_IN',{user:account});};
window.__setupCalls=[];window.__verifyCalls=[];
const factors=()=>{const verified=account.factors||(account.factor?[{id:account.factor,status:'verified',factor_type:'totp',friendly_name:'4M Banking',created_at:'2026-10-31T18:19:08Z'}]:[]);return {totp:verified,all:[...verified,...(account.pending?[{id:account.pending,status:'unverified',factor_type:'totp'}]:[])]};};
window.__refreshAuth=()=>callback('TOKEN_REFRESHED',{user:account});
window.__removeFactors=()=>{account.factor='';account.factors=[];account.pending='';window.__refreshAuth();};
export const supabase={
 rpc:async name=>({data:name==='messaging_event_directory'?[]:{enabled:true,rulesAccepted:true,interactive:true},error:null}),
 auth:{onAuthStateChange(fn){callback=fn;queueMicrotask(()=>fn('INITIAL_SESSION',{user:account}));return {data:{subscription:{unsubscribe(){}}}};},
 getSession:async()=>({data:{session:{user:account}}}),
 mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:account.verified?'aal2':'aal1'}}),
 listFactors:async()=>{const captured=factors();return window.__delayFactors?new Promise(resolve=>{window.__releaseFactors=()=>resolve({data:captured});}):{data:captured};},
 enroll:async()=>{window.__setupCalls.push(account.email);account.pending='new-factor';return {data:{id:'new-factor',totp:{secret:'LOCAL_PREVIEW_KEY',qr_code:'<svg xmlns="http://www.w3.org/2000/svg"/>'}}};},
 challengeAndVerify:async data=>{window.__verifyCalls.push(data);account.verified=true;if(account.pending){account.factor=account.pending;account.pending='';}window.__refreshAuth();return {error:null};}}}

};`;
before(async()=>{
 for(const [screen,component] of Object.entries({events:'EventMessaging',help:'HelpRequestsAdmin'})) await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Screen from './src/components/admin/${component}.jsx';createRoot(document.getElementById('root')).render(<Screen/>);`,resolveDir:root,loader:'jsx'},outfile:outputs[screen],bundle:true,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"test"'},plugins:[{name:'mfa-account-fixture',setup(b){
 b.onResolve({filter:/supabaseClient$/},()=>({path:'supabase',namespace:'mock'}));
 b.onResolve({filter:/^\.\/(EventMessagingWorkspace|PlayerMessaging)$/},()=>({path:'component',namespace:'mock'}));
 b.onResolve({filter:/utils\/helpRequests$/},()=>({path:'help-api',namespace:'mock'}));
 b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:args.path==='supabase'?mock:args.path==='help-api'?'export const helpRequestApi=async()=>({rows:[],next:null});export const helpStatusText={};export const helpTopicText={};':'export default function Component(){return null}',loader:'jsx',resolveDir:root}));
 }}]});
 browser=await puppeteer.launch({headless:true,args:['--no-sandbox']});
});
after(async()=>{await browser?.close();fs.rmSync(temporary,{recursive:true,force:true});});
async function open(screen){const page=await browser.newPage();await page.setContent('<div id="root"></div>');await page.addScriptTag({path:outputs[screen]});await page.waitForFunction(()=>document.body.textContent.includes('first@example.test'));return page;}
for (const screen of ['events','help']) {
test(`${screen}: a second login gets its own first-time setup, never the first account’s factor`,async()=>{
 const page=await open(screen);try{
  assert.match(await page.$eval('body',e=>e.textContent),/Verify with your authenticator/);
  await page.evaluate(()=>window.__changeAccount({id:'second',email:'second@example.test'}));
  await page.waitForFunction(()=>document.body.textContent.includes('second@example.test')&&[...document.querySelectorAll('button')].some(b=>b.textContent==='Set up authenticator'));
  assert.doesNotMatch(await page.$eval('body',e=>e.textContent),/first@example.test|Verify with your authenticator/);
  await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Set up authenticator').click());
  await page.waitForSelector('code');
  assert.deepEqual(await page.evaluate(()=>window.__setupCalls),['second@example.test']);
  await page.evaluate(()=>window.__changeAccount({id:'first',email:'first@example.test',factor:'first-factor'}));
  await page.waitForFunction(()=>document.body.textContent.includes('Verify with your authenticator'));
  assert.equal(await page.$('code'),null);assert.doesNotMatch(await page.$eval('body',e=>e.textContent),/LOCAL_PREVIEW_KEY|second@example.test/);
 }finally{await page.close();}
});
test(`${screen}: a delayed factor response from a previous login cannot overwrite the new account`,async()=>{
 const page=await open(screen);try{
  await page.evaluate(()=>{window.__delayFactors=true;[...document.querySelectorAll('button')].find(b=>b.textContent==='Refresh').click();});
  await page.waitForFunction(()=>window.__releaseFactors);
  await page.evaluate(()=>{window.__delayFactors=false;window.__changeAccount({id:'second',email:'second@example.test'});});
  await page.waitForFunction(()=>document.body.textContent.includes('second@example.test')&&[...document.querySelectorAll('button')].some(b=>b.textContent==='Set up authenticator'));
  await page.evaluate(()=>window.__releaseFactors());
  assert.doesNotMatch(await page.$eval('body',e=>e.textContent),/first@example.test|Verify with your authenticator/);
  assert.equal(await page.$('input[name="messaging-authenticator-code"]'),null);
 }finally{await page.close();}
});

test(`${screen}: refreshing a pending setup keeps its QR and verifies the matching enrollment`,async()=>{
 const page=await open(screen);try{
  await page.evaluate(()=>window.__changeAccount({id:'new',email:'new@example.test'}));
  await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Set up authenticator'));
  await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Set up authenticator').click());
  await page.waitForSelector('code');
  await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Refresh').click());
  await page.waitForFunction(()=>document.querySelector('input[name="messaging-authenticator-code"]')&&document.querySelector('code')?.textContent==='LOCAL_PREVIEW_KEY');
  await page.type('input[name="messaging-authenticator-code"]','123456');
  await page.click('button[type="submit"]');
  await page.waitForFunction(()=>window.__verifyCalls.length===1&&!document.querySelector('input[name="messaging-authenticator-code"]'));
  assert.deepEqual(await page.evaluate(()=>window.__verifyCalls),[{factorId:'new-factor',code:'123456'}]);
  assert.equal(await page.$('code'),null);
 }finally{await page.close();}
});
test(`${screen}: a recovered account returns to setup instead of retaining a removed factor`,async()=>{
 const page=await open(screen);try{
  await page.evaluate(()=>window.__removeFactors());
  await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Set up authenticator'));
  assert.equal(await page.$('input[name="messaging-authenticator-code"]'),null);
  assert.doesNotMatch(await page.$eval('body',e=>e.textContent),/4M Banking/);
 }finally{await page.close();}
});
test(`${screen}: switching to the authenticator app hides the QR and restores the same pending setup on return`,async()=>{
 const page=await open(screen);try{
  await page.evaluate(()=>window.__changeAccount({id:'new',email:'new@example.test'}));
  await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Set up authenticator'));
  await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Set up authenticator').click());
  await page.waitForSelector('code');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForFunction(()=>!document.querySelector('code'));
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForFunction(()=>document.querySelector('code')?.textContent==='LOCAL_PREVIEW_KEY');
  assert.deepEqual(await page.evaluate(()=>window.__setupCalls),['new@example.test']);
  await page.type('input[name="messaging-authenticator-code"]','123456');
  await page.click('button[type="submit"]');
  await page.waitForFunction(()=>window.__verifyCalls.length===1&&!document.querySelector('input[name="messaging-authenticator-code"]'));
  assert.deepEqual(await page.evaluate(()=>window.__verifyCalls),[{factorId:'new-factor',code:'123456'}]);
 }finally{await page.close();}
});
test(`${screen}: the account's banking factor is labelled and another connected factor can be verified`,async()=>{
 const page=await open(screen);try{
  assert.match(await page.$eval('body',e=>e.textContent),/Connected authenticator: 4M Banking/);
  await page.evaluate(()=>window.__changeAccount({id:'multiple',email:'multiple@example.test',factors:[{id:'banking',status:'verified',friendly_name:'4M Banking'},{id:'messages',status:'verified',friendly_name:'4M messages'}]}));
  await page.waitForSelector('select');
  await page.type('input[name="messaging-authenticator-code"]','111111');
  await page.select('select','messages');
  assert.equal(await page.$eval('input[name="messaging-authenticator-code"]',e=>e.value),'');
  await page.type('input[name="messaging-authenticator-code"]','654321');
  await page.click('button[type="submit"]');
  await page.waitForFunction(()=>window.__verifyCalls.length===1);
  assert.deepEqual(await page.evaluate(()=>window.__verifyCalls),[{factorId:'messages',code:'654321'}]);
  assert.deepEqual(await page.evaluate(()=>window.__setupCalls),[]);
 }finally{await page.close();}
});
}
