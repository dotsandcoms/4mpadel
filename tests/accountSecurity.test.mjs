import test, {before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {build} from 'esbuild';
import puppeteer from 'puppeteer';
const root=process.cwd(),temporary=fs.mkdtempSync(path.join(os.tmpdir(),'4m-account-security-')),output=path.join(temporary,'fixture.js');
let browser;
const mock=`
const callbacks=new Set();let account={id:'actor',email:'admin@example.test'};
window.__factors??=[{id:'primary',status:'verified',factor_type:'totp',friendly_name:'Primary phone',created_at:'2026-11-01T12:00:00Z'}];
window.__enrollments=[];window.__verifications=[];window.__removals=[];window.__recoveryCalls=[];
const notify=()=>callbacks.forEach(fn=>fn('TOKEN_REFRESHED',{user:account}));
window.__signOut=()=>{account=null;callbacks.forEach(fn=>fn('SIGNED_OUT',null));};
const result=()=>({data:{all:window.__factors,totp:window.__factors.filter(f=>f.status==='verified')}});
export const supabase={auth:{
 getUser:async()=>({data:{user:account}}),getSession:async()=>({data:{session:account?{user:account}:null}}),
 refreshSession:async()=>{notify();return {data:{session:{user:account}}};},
 onAuthStateChange(fn){callbacks.add(fn);return {data:{subscription:{unsubscribe(){callbacks.delete(fn);}}}};},
 mfa:{listFactors:async()=>result(),
 enroll:async input=>{window.__enrollments.push(input);const id='enrollment-'+window.__enrollments.length;window.__factors.push({id,status:'unverified',factor_type:'totp',friendly_name:input.friendlyName,created_at:'2026-11-16T12:00:00Z'});return {data:{id,totp:{secret:'FICTIONAL_PREVIEW_KEY',qr_code:'<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192"><rect width="192" height="192" fill="white"/></svg>'}}};},
 challengeAndVerify:async input=>{window.__verifications.push(input);if(input.code!=='123456')return {error:{message:'invalid'}};const factor=window.__factors.find(f=>f.id===input.factorId);factor.status='verified';notify();return {data:{}};},
 unenroll:async input=>{window.__removals.push(input);window.__factors=window.__factors.filter(f=>f.id!==input.factorId);return {data:{}};}}
},functions:{invoke:async(_name,{body})=>{window.__recoveryCalls.push(body);if(window.__denyRecovery)return {error:{context:{json:async()=>({error:'RECOVERY_MFA_REQUIRED',message:'Verify a fresh authenticator code and try again.'})}}};return {data:body.action==='lookup'?{email:body.email,userId:'other',factors:[{id:'other-primary',status:'verified',friendly_name:'Lost phone',created_at:'2026-11-01T12:00:00Z'}]}:body.action==='reset'?{state:'completed',requestId:body.requestId}:[{id:'history-1',target_email:'other@example.test',state:'completed',created_at:'2026-11-16T12:00:00Z'}]};}}};`;
before(async()=>{
 await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Screen from './src/components/admin/AccountSecurity.jsx';createRoot(document.getElementById('root')).render(<Screen userId="actor" canRecover={window.__canRecover!==false}/>);`,resolveDir:root,loader:'jsx'},outfile:output,bundle:true,platform:'browser',format:'iife',define:{'process.env.NODE_ENV':'"test"'},plugins:[{name:'security-fixture',setup(b){b.onResolve({filter:/supabaseClient$/},()=>({path:'supabase',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:mock,loader:'js'}));}}]});
 browser=await puppeteer.launch({headless:true,args:['--no-sandbox']});
});
after(async()=>{await browser?.close();fs.rmSync(temporary,{recursive:true,force:true});});
async function open(initial={}){const page=await browser.newPage();await page.setContent('<div id="root"></div>');await page.evaluate(initial=>{Object.assign(window,initial);Object.defineProperty(crypto,'randomUUID',{value:()=> '40000000-0000-0000-0000-000000000001'});},initial);await page.addScriptTag({path:output});await page.waitForFunction(()=>document.body.textContent.includes('Signed in as'));return page;}
async function click(page,text){await page.evaluate(text=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text);if(!button)throw new Error('Missing button: '+text);button.click();},text);}
async function verify(page){await page.waitForSelector('input[name="banking-totp"]');await page.type('input[name="banking-totp"]','123456');await click(page,'Verify');}
test('an account without factors starts from a QR, verifies, then can add a backup',async()=>{
 const page=await open({__factors:[]});try{
  await click(page,'Set up authenticator');await page.waitForSelector('img');assert.equal((await page.evaluate(()=>window.__enrollments))[0].issuer,'4M Padel');
  await page.type('input[name="messaging-authenticator-code"]','123456');await click(page,'Verify code');
  await page.waitForFunction(()=>document.body.textContent.includes('Authenticator connected.')&&[...document.querySelectorAll('button')].some(b=>b.textContent==='Add backup authenticator'));
  assert.equal(await page.$('code'),null);
 }finally{await page.close();}
});
test('adding a backup requires verification, survives switching apps and can replace the original factor',async()=>{
 const page=await open();try{
  await click(page,'Add backup authenticator');assert.equal(await page.$('code'),null);assert.equal(await page.evaluate(()=>window.__enrollments.length),0);
  await verify(page);await page.waitForSelector('input[name="authenticator-name"]');
  await page.$eval('input[name="authenticator-name"]',e=>{e.focus();e.select();});await page.type('input[name="authenticator-name"]','Laptop vault');await click(page,'Show setup QR');await page.waitForSelector('code');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForFunction(()=>!document.querySelector('code'));
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForSelector('code');await page.type('input[name="messaging-authenticator-code"]','123456');await click(page,'Verify code');
  await page.waitForFunction(()=>document.body.textContent.includes('4M Padel · Laptop vault')&&!document.querySelector('code'));
  await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Remove Primary phone').click());
  await page.waitForSelector('select');await page.select('select','enrollment-1');await verify(page);await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Remove authenticator'));
  assert.equal(await page.evaluate(()=>window.__removals.length),0);await click(page,'Remove authenticator');
  await page.waitForFunction(()=>window.__removals.length===1&&!document.body.textContent.includes('Remove Primary phone'));
  assert.deepEqual(await page.evaluate(()=>window.__factors.map(f=>f.id)),['enrollment-1']);
  assert.equal((await page.evaluate(()=>window.__verifications)).at(-1).factorId,'enrollment-1');
 }finally{await page.close();}
});
test('removing the last factor requires a review and returns to fresh setup',async()=>{
 const page=await open();try{
  await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Remove Primary phone').click());await verify(page);
  await page.waitForFunction(()=>document.body.textContent.includes('This is your last authenticator.'));
  assert.equal(await page.evaluate(()=>window.__removals.length),0);await click(page,'Remove authenticator');
  await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Set up authenticator'));
  assert.deepEqual(await page.evaluate(()=>window.__removals),[{factorId:'primary'}]);
 }finally{await page.close();}
});
test('assisted recovery requires fresh verification, identity confirmation and review of the exact target',async()=>{
 const page=await open();try{
  await click(page,'Verify to recover another account');await verify(page);
  await page.waitForSelector('input[name="recovery-email"]');assert.equal((await page.$$('input[name="recovery-email"]')).length,1);await page.type('input[name="recovery-email"]','other@example.test');await click(page,'Find account');
  await page.waitForSelector('textarea[name="recovery-reason"]');
  assert.equal(await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Review reset').disabled),true);
  await page.type('textarea[name="recovery-reason"]','Confirmed directly with the account owner by phone.');
  await page.evaluate(()=>{const labels=[...document.querySelectorAll('label')];labels.find(l=>l.textContent.includes('I verified this person')).querySelector('input').click();});
  await click(page,'Review reset');await page.waitForFunction(()=>document.body.textContent.includes('Review reset for other@example.test'));
  assert.equal(await page.evaluate(()=>window.__recoveryCalls.some(c=>c.action==='reset')),false);await click(page,'Reset selected authenticators');
  await page.waitForFunction(()=>document.body.textContent.includes('Authenticator reset for other@example.test'));
  const call=await page.evaluate(()=>window.__recoveryCalls.find(c=>c.action==='reset'));assert.equal(call.email,'other@example.test');assert.deepEqual(call.factorIds,['other-primary']);assert.equal(call.identityConfirmed,true);assert.match(call.requestId,/^[a-f\d-]{36}$/);assert.deepEqual(await page.evaluate(()=>window.__removals),[]);
 }finally{await page.close();}
});
test('organisation users manage their own authenticators without seeing privileged recovery controls',async()=>{
 const page=await open({__canRecover:false});try{assert.doesNotMatch(await page.$eval('body',e=>e.textContent),/Verify to recover another account/);assert.match(await page.$eval('body',e=>e.textContent),/Add backup authenticator/);}finally{await page.close();}
});
test('signing out clears setup secrets from the screen',async()=>{
 const page=await open({__factors:[]});try{await click(page,'Set up authenticator');await page.waitForSelector('code');await page.evaluate(()=>window.__signOut());await page.waitForFunction(()=>!document.querySelector('code'));assert.doesNotMatch(await page.$eval('body',e=>e.textContent),/FICTIONAL_PREVIEW_KEY/);}finally{await page.close();}
});
