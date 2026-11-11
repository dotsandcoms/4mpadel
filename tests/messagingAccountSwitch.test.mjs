import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {build} from 'esbuild';
import puppeteer from 'puppeteer';
const root=process.cwd(),temporary=fs.mkdtempSync(path.join(os.tmpdir(),'4m-mfa-accounts-')),output=path.join(temporary,'fixture.js');
let browser;
const mock=`
let account={id:'first',email:'first@example.test',factor:'first-factor'},callback;
window.__changeAccount=next=>{account=next;callback('SIGNED_IN',{user:account});};
window.__setupCalls=[];
export const supabase={
 rpc:async name=>({data:name==='messaging_event_directory'?[]:{enabled:true,rulesAccepted:true,interactive:true},error:null}),
 auth:{onAuthStateChange(fn){callback=fn;queueMicrotask(()=>fn('INITIAL_SESSION',{user:account}));return {data:{subscription:{unsubscribe(){}}}};},
 getSession:async()=>({data:{session:{user:account}}}),
 mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:'aal1'}}),
 listFactors:async()=>{const captured=account;return window.__delayFactors?new Promise(resolve=>{window.__releaseFactors=()=>resolve({data:{totp:captured.factor?[{id:captured.factor,status:'verified'}]:[]}});}):{data:{totp:captured.factor?[{id:captured.factor,status:'verified'}]:[]}};},
 enroll:async()=>{window.__setupCalls.push(account.email);return {data:{id:'new-factor',totp:{secret:'LOCAL_PREVIEW_KEY',qr_code:'<svg xmlns="http://www.w3.org/2000/svg"/>'}}};},
 challengeAndVerify:async()=>({error:null})}}
};`;
before(async()=>{
 await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Screen from './src/components/admin/EventMessaging.jsx';createRoot(document.getElementById('root')).render(<Screen/>);`,resolveDir:root,loader:'jsx'},outfile:output,bundle:true,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"test"'},plugins:[{name:'mfa-account-fixture',setup(b){
 b.onResolve({filter:/supabaseClient$/},()=>({path:'supabase',namespace:'mock'}));
 b.onResolve({filter:/^\.\/(EventMessagingWorkspace|PlayerMessaging)$/},()=>({path:'component',namespace:'mock'}));
 b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:args.path==='supabase'?mock:'export default function Component(){return null}',loader:'jsx',resolveDir:root}));
 }}]});
 browser=await puppeteer.launch({headless:true,args:['--no-sandbox']});
});
after(async()=>{await browser?.close();fs.rmSync(temporary,{recursive:true,force:true});});
async function open(){const page=await browser.newPage();await page.setContent('<div id="root"></div>');await page.addScriptTag({path:output});await page.waitForFunction(()=>document.body.textContent.includes('first@example.test'));return page;}
test('a second login gets its own first-time setup, never the first account’s factor',async()=>{
 const page=await open();try{
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
test('a delayed factor response from a previous login cannot overwrite the new account',async()=>{
 const page=await open();try{
  await page.evaluate(()=>{window.__delayFactors=true;[...document.querySelectorAll('button')].find(b=>b.textContent==='Refresh').click();});
  await page.waitForFunction(()=>window.__releaseFactors);
  await page.evaluate(()=>{window.__delayFactors=false;window.__changeAccount({id:'second',email:'second@example.test'});});
  await page.waitForFunction(()=>document.body.textContent.includes('second@example.test')&&[...document.querySelectorAll('button')].some(b=>b.textContent==='Set up authenticator'));
  await page.evaluate(()=>window.__releaseFactors());
  assert.doesNotMatch(await page.$eval('body',e=>e.textContent),/first@example.test|Verify with your authenticator/);
  assert.equal(await page.$('input[name="messaging-authenticator-code"]'),null);
 }finally{await page.close();}
});
