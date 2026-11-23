import test,{before,after}from'node:test';
import assert from'node:assert/strict';
import fs from'node:fs';
import os from'node:os';
import path from'node:path';
import{build}from'esbuild';
import puppeteer from'puppeteer';
const root=process.cwd(),directory=fs.mkdtempSync(path.join(os.tmpdir(),'4m-event-auth-lifecycle-')),output=path.join(directory,'fixture.js');
let browser;
const mock=`
const account={id:'admin',email:'admin@example.test',verified:true};let callback;
window.__calls=[];window.__factorCalls=0;
window.__authChanged=()=>callback('TOKEN_REFRESHED',{user:account});
window.__setVerified=value=>{account.verified=value;window.__authChanged();};
window.__restoreVerification=()=>{account.verified=true;window.__failFactors=false;};
window.__releaseReads=[];
const result=data=>({data,error:null});
export const supabase={
 async rpc(name,args){
  const action=name==='messaging_api'?args.p_action:name;
  const data=name==='messaging_api'?args.p_data:args;
  window.__calls.push({action,data});
  if(action==='status')return result({enabled:true,rulesAccepted:true,interactive:true,supportAllowed:true});
  if(action==='messaging_event_directory')return result([{id:'100',title:'First event'},{id:'200',title:'Second event'}]);
  if(action==='open_event')return result([{id:data.eventId+'-announcements',kind:'event_announcements',canSend:true,manager:!window.__onlyParticipant},{id:data.eventId+'-discussion',kind:'event_discussion',canSend:true,manager:!window.__onlyParticipant}]);
  if(action==='messaging_event_analytics')return args.p_event===window.__deniedEvent?{error:{code:'42501',message:'Event messaging access denied.'}}:result({event:{id:args.p_event,title:args.p_event===100?'First event':'Second event'},summary:{}});
  if(action==='read'){const page={messages:[{id:'message-'+data.conversationId,seq:1,body:'Messages for '+data.conversationId}],next:null};if(window.__delayReads)return new Promise(resolve=>window.__releaseReads.push(()=>resolve(result(page))));return result(page);}
  if(action==='audience')return result({allCount:1,selectedCount:1,divisions:[]});
  return result({});
 },
 auth:{onAuthStateChange(fn){callback=fn;queueMicrotask(()=>fn('INITIAL_SESSION',{user:account}));return {data:{subscription:{unsubscribe(){}}}};},
 getSession:async()=>result({session:{user:account,access_token:'fictional-token'}}),
 mfa:{getAuthenticatorAssuranceLevel:async()=>result({currentLevel:account.verified?'aal2':'aal1'}),
 listFactors:async()=>{window.__factorCalls++;const data={totp:[{id:'admin-factor',status:'verified',factor_type:'totp',friendly_name:'Primary phone'}]};if(window.__delayFactors)return new Promise(resolve=>{window.__releaseFactors=()=>resolve(result(data));});return window.__failFactors?{error:{message:'offline'}}:result(data);},
 challengeAndVerify:async()=>{account.verified=true;window.__authChanged();return result({});}}},
 realtime:{setAuth:async()=>{}},channel(){const channel={on(){return channel},subscribe(){return channel}};return channel},removeChannel:async()=>{}
};`;
const workspace=`import React from 'react';export default function Workspace({events,onSelect,page,onKind}){return <div aria-label="Event workspace">{events.map(event=><button key={event.id} onClick={()=>onSelect(event.id)}>{'Open '+event.title}</button>)}<button onClick={()=>onKind('event_discussion')}>Show discussion</button><div data-testid="event-messages">{page?.messages?.map(message=><p key={message.id}>{message.body}</p>)}</div></div>}`;
before(async()=>{
 await build({stdin:{contents:`import React from'react';import{createRoot}from'react-dom/client';import Screen from './src/components/admin/EventMessaging.jsx';createRoot(document.getElementById('root')).render(<Screen/>);`,resolveDir:root,loader:'jsx'},outfile:output,bundle:true,format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"test"'},plugins:[{name:'verified-event-fixture',setup(b){b.onResolve({filter:/supabaseClient$/},()=>({path:'supabase',namespace:'mock'}));b.onResolve({filter:/^\.\/EventMessagingWorkspace$/},()=>({path:'workspace',namespace:'mock'}));b.onResolve({filter:/^\.\/PlayerMessaging$/},()=>({path:'players',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:args.path==='supabase'?mock:args.path==='workspace'?workspace:'export default function Component(){return null}',loader:'jsx',resolveDir:root}));}}]});
 browser=await puppeteer.launch({headless:true,args:['--no-sandbox']});
});
after(async()=>{await browser?.close();fs.rmSync(directory,{recursive:true,force:true});});
async function open(){const page=await browser.newPage();await page.setContent('<div id="root"></div>');await page.addScriptTag({path:output});await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Open First event'));return page;}
async function click(page,label){await page.evaluate(label=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===label).click(),label);}
async function messages(page,text){try{await page.waitForFunction(text=>document.querySelector('[data-testid="event-messages"]')?.textContent.includes(text),{timeout:2000},text);}catch{throw new Error('Event failed to open: '+await page.$eval('body',node=>node.textContent));}}
test('selecting an event retains verified access and opens its messages',async()=>{
 const page=await open();try{
  const checks=await page.evaluate(()=>window.__factorCalls);
  await click(page,'Open First event');await messages(page,'100-announcements');
  assert.doesNotMatch(await page.$eval('body',node=>node.textContent),/Checking authenticator|Verify with your authenticator/);
  assert.equal(await page.evaluate(()=>window.__factorCalls),checks);
  await click(page,'Open Second event');await messages(page,'200-announcements');
  assert.doesNotMatch(await page.$eval('[data-testid="event-messages"]',node=>node.textContent),/100-announcements/);
  await click(page,'Show discussion');await messages(page,'200-discussion');
 }finally{await page.close();}
});
test('Admin does not read a foreign event after its manager grant is revoked',async()=>{
 const page=await open();try{
  await click(page,'Open First event');await messages(page,'100-announcements');
  await page.evaluate(()=>{window.__deniedEvent=100;window.__calls=[];});await click(page,'Refresh');
  await page.waitForFunction(()=>document.querySelector('[role="alert"]')?.textContent.includes('Event messaging access denied.'));
  assert.doesNotMatch(await page.$eval('[data-testid="event-messages"]',node=>node.textContent),/100-announcements/);
  assert.deepEqual(await page.evaluate(()=>window.__calls.map(call=>call.action)),['messaging_event_analytics']);
 }finally{await page.close();}
});
test('a participant response cannot replace a manager conversation',async()=>{
 const page=await open();try{
  await page.evaluate(()=>{window.__onlyParticipant=true;});await click(page,'Open First event');
  await page.waitForFunction(()=>document.querySelector('[role="alert"]')?.textContent.includes('Event messaging access denied.'));
  assert.equal(await page.evaluate(()=>window.__calls.some(call=>call.action==='read')),false);
 }finally{await page.close();}
});
test('opening another event cannot cancel a delayed authenticator check',async()=>{
 const page=await open();try{
  await click(page,'Open First event');await messages(page,'100-announcements');
  await page.evaluate(()=>{window.__delayFactors=true;window.__authChanged();});await page.waitForFunction(()=>window.__releaseFactors);
  await click(page,'Open Second event');await messages(page,'200-announcements');
  await page.evaluate(()=>{window.__delayFactors=false;window.__releaseFactors();});
  await page.waitForFunction(()=>!document.body.textContent.includes('Checking authenticator'));
  await messages(page,'200-announcements');
 }finally{await page.close();}
});
test('an earlier event response cannot overwrite the latest selected event',async()=>{
 const page=await open();try{
  await page.evaluate(()=>{window.__delayReads=true;});await click(page,'Open First event');await page.waitForFunction(()=>window.__releaseReads.length===1);
  await page.evaluate(()=>{window.__delayReads=false;});await click(page,'Open Second event');await messages(page,'200-announcements');
  await page.evaluate(()=>window.__releaseReads[0]());await messages(page,'200-announcements');
  assert.doesNotMatch(await page.$eval('[data-testid="event-messages"]',node=>node.textContent),/100-announcements/);
 }finally{await page.close();}
});
test('a failed account check stops the loading message and Refresh retries it for the selected event',async()=>{
 const page=await open();try{
  await click(page,'Open First event');await messages(page,'100-announcements');
  await page.evaluate(()=>{window.__failFactors=true;window.__setVerified(false);});await page.waitForSelector('[role="alert"]');
  await page.waitForSelector('[role="alert"]');
  assert.doesNotMatch(await page.$eval('body',node=>node.textContent),/Checking authenticator/);
  await page.evaluate(()=>window.__restoreVerification());await click(page,'Refresh');await messages(page,'100-announcements');
 }finally{await page.close();}
});
test('returning from another app restores the selected event after rechecking authentication',async()=>{
 const page=await open();try{
  await click(page,'Open First event');await messages(page,'100-announcements');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForFunction(()=>!document.querySelector('[data-testid="event-messages"]'));
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
  await messages(page,'100-announcements');
  assert.doesNotMatch(await page.$eval('body',node=>node.textContent),/Checking authenticator|Verify with your authenticator/);
 }finally{await page.close();}
});
