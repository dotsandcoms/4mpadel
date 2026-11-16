import test,{before,after}from'node:test';
import assert from'node:assert/strict';
import fs from'node:fs';import os from'node:os';import path from'node:path';
import{build}from'esbuild';import puppeteer from'puppeteer';
const root=process.cwd(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'4m-player-queue-')),output=path.join(dir,'fixture.js');let browser;
const fixture=`
import React from 'react';import{createRoot}from'react-dom/client';import Screen from './src/components/admin/PlayerMessaging.jsx';
const org='org:db49d267-8d75-448f-a14b-d37b8c6d294c';
window.crypto.randomUUID=()=> 'fixture-key-'+Math.random();
window.__calls=[];window.__rows=Array.from({length:121},(_,n)=>({id:'chat-'+n,title:n===0?'Brad Elin':n===1?'Testing Group Chats':'Player '+n,group:n===1,scope:org,senderLabel:'10by20 Events',participants:n===1?['Brad Elin','Mark Stillerman']:['Brad Elin'],participantCount:n===1?2:1,unread:n===0?3:0,waitingCount:n===2?1:0,canSend:true,preview:n===0?'Can you confirm our next match time?':'Thanks, see you on court.',lastMessageMine:n===1,updatedAt:'2026-11-16T07:10:00Z'}));
window.__rpc=async(action,data={})=>{
 window.__calls.push({action,data});
 if(action==='admin_scopes')return [{id:'platform',label:'4M platform'},{id:org,label:'10by20 Events',globalAudience:window.__globalAudience===true}];
 if(action==='admin_inbox_page'){
  if(window.__inboxFail)throw Error('Connection unavailable.');
  const rows=window.__rows.filter(r=>(!data.query||r.title.toLowerCase().includes(data.query.toLowerCase()))&&(data.status!=='unread'||r.unread)&&(data.status!=='waiting'||r.waitingCount)&&(data.kind==='all'||(data.kind==='group')===r.group)&&(data.scope==='all'||data.scope===r.scope));
  const start=data.before?rows.findIndex(r=>r.id===data.before.id)+1:0;const result={rows:rows.slice(start,start+50),next:rows.length>start+50?{updatedAt:'2026-11-16T07:10:00Z',id:rows[start+49].id}:null};
  if(window.__delayInbox)return new Promise(resolve=>window.__releaseInbox=()=>resolve(result));return result;
 }
 if(action==='admin_players'){if(window.__searchFail)throw Error('Connection unavailable.');return [{id:'42',name:'Brad Elin',home_club:'Example club'}];}
 if(action==='read')return {conversation:window.__rows.find(r=>r.id===data.conversationId),messages:[{id:'message',seq:1,mine:false,body:'Ready for a reply',createdAt:'2026-11-16T07:10:00Z',sender:{name:'Brad Elin'}}],next:null};
 if(action==='admin_send')return [{id:'new-chat',status:'sent'}];
 return {};
};
createRoot(document.getElementById('root')).render(<Screen rpc={window.__rpc} owner="fictional-admin"/>);`;
before(async()=>{
 await build({stdin:{contents:fixture,resolveDir:root,loader:'jsx'},outfile:output,bundle:true,format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"test"','import.meta.env':'{}'},plugins:[{name:'fictional-auth',setup(b){b.onResolve({filter:/supabaseClient$/},()=>({path:'supabase',namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const supabase={auth:{getSession:async()=>({data:{session:null}})}};',loader:'js'}));}}]});
 browser=await puppeteer.launch({headless:true,args:['--no-sandbox']});
});
after(async()=>{await browser?.close();fs.rmSync(dir,{recursive:true,force:true});});
async function open(){const page=await browser.newPage();page.setDefaultTimeout(5000);page.on('pageerror',error=>console.error(error.message));await page.setViewport({width:1440,height:1000});await page.setContent('<style>body{background:#0d1112;color:#f0f3f2;font:14px system-ui;margin:48px}*{box-sizing:border-box}button,input,select,textarea{font:inherit}button{cursor:pointer}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}.em-secondary{border:1px solid #465052;background:#20272a;color:#eaf0ec;padding:10px 14px;border-radius:10px}.em-error{padding:16px;background:#351d1d;color:#fcc}.em-feedback{color:#bcdac9}</style><div id="root"></div>');await page.addStyleTag({path:output.replace(/\.js$/,'.css')});await page.addScriptTag({path:output});await page.waitForSelector('.pm-conversation-link');return page;}
async function click(page,text){await page.evaluate(text=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text).click(),text);}
async function field(page,selector,text){await page.$eval(selector,(input,text)=>{const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(input,text);input.dispatchEvent(new Event('input',{bubbles:true}));},text);}
async function chooseOrg(page){await page.click('#player-message-scope');await page.type('#player-message-scope','10by20');await page.waitForSelector('[role="option"]');await page.click('[role="option"]');}
test('conversation list leads with previews, unread counts, senders and dates; pages beyond 100',async()=>{const page=await open();try{
 assert.equal(await page.$('textarea'),null);assert.equal(await page.$$eval('.pm-table tbody tr',r=>r.length),50);
 assert.match(await page.$eval('.pm-table',n=>n.textContent),/Brad Elin.*Can you confirm.*10by20 Events.*3 unread/s);
 await click(page,'Next');await page.waitForFunction(()=>document.querySelector('.pm-conversation-link')?.textContent.includes('Player 50'));
 await click(page,'Next');await page.waitForFunction(()=>document.querySelector('.pm-conversation-link')?.textContent.includes('Player 100'));
 assert.equal(await page.$$eval('.pm-table tbody tr',r=>r.length),21);
 await click(page,'Previous');await page.waitForFunction(()=>document.querySelector('.pm-conversation-link')?.textContent.includes('Player 50'));
}finally{await page.close();}});
test('server search and filters survive opening and replying to a conversation',async()=>{const page=await open();try{
 await page.type('.pm-filter-search input','Brad');await page.waitForFunction(()=>document.querySelectorAll('.pm-conversation-link').length===1);
 await page.type('.pm-filter-search input',' ');await page.waitForFunction(()=>document.querySelectorAll('.pm-conversation-link').length===1);
 await page.click('.pm-conversation-link');await page.waitForSelector('#player-message-body');await page.type('#player-message-body','Fictional reply only');
 await click(page,'Review message');await click(page,'Send reply');await page.waitForFunction(()=>window.__calls.some(c=>c.action==='send'));
 await click(page,'Back to conversations');assert.equal(await page.$eval('.pm-filter-search input',n=>n.value),'Brad ');
 await page.waitForFunction(()=>document.querySelectorAll('.pm-conversation-link').length===1);
 assert(await page.evaluate(()=>window.__calls.some(c=>c.action==='admin_inbox_page'&&c.data.query==='Brad')));
}finally{await page.close();}});
test('organisation player search has its own error and retry, rather than a false empty result',async()=>{const page=await open();try{
 await click(page,'New message');await chooseOrg(page);await page.evaluate(()=>window.__searchFail=true);await page.type('[aria-label="Search authorised players"]','brad');
 await page.waitForSelector('.pm-search-error');assert.doesNotMatch(await page.$eval('body',n=>n.textContent),/No eligible players match/);
 await page.evaluate(()=>window.__searchFail=false);await click(page,'Retry player search');await page.waitForSelector('.pm-player');
 assert(await page.evaluate(()=>window.__calls.some(c=>c.action==='admin_players'&&c.data.scope.startsWith('org:')&&c.data.query==='brad')));
 await page.click('.pm-player input');await page.type('#player-message-body','Fictional invitation');await click(page,'Review message');
 assert.match(await page.$eval('.pm-review',n=>n.textContent),/Sending as 10by20 Events/);
 await click(page,'Send private messages');await page.waitForSelector('.pm-table');
 assert(await page.evaluate(()=>window.__calls.some(c=>c.action==='admin_send'&&c.data.scope.startsWith('org:')&&c.data.playerIds[0]===42)));
}finally{await page.close();}});
test('failed inbox loads can retry and a stale reply cannot replace filtered results',async()=>{const page=await open();try{
 await page.evaluate(()=>window.__inboxFail=true);await click(page,'Refresh list');await page.waitForSelector('.pm-queue-error');assert.doesNotMatch(await page.$eval('body',n=>n.textContent),/No conversations match/);
 await page.evaluate(()=>window.__inboxFail=false);await click(page,'Retry conversations');await page.waitForSelector('.pm-conversation-link');
 await page.evaluate(()=>window.__delayInbox=true);await click(page,'Refresh list');await page.waitForFunction(()=>window.__releaseInbox);
 await page.evaluate(()=>window.__delayInbox=false);await page.select('.pm-filter select','all');
 await page.select('.pm-filter:nth-child(3) select','unread');await page.waitForFunction(()=>document.querySelectorAll('.pm-conversation-link').length===1);
 await page.evaluate(()=>window.__releaseInbox());assert.equal(await page.$$('.pm-conversation-link').then(r=>r.length),1);
}finally{await page.close();}});
test('queue matches Help-style reference on desktop and stays within narrow screen',async()=>{const page=await open();try{
 const qa=path.join(root,'outputs/player-messaging-inbox-20261116');fs.mkdirSync(qa,{recursive:true});await page.screenshot({path:path.join(qa,'desktop.png')});
 await page.setViewport({width:390,height:844});await page.addStyleTag({content:'body{margin:16px}'});await page.screenshot({path:path.join(qa,'mobile.png'),fullPage:false});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 assert(await page.$eval('.pm-table-scroll',n=>n.scrollWidth>n.clientWidth));
 await page.focus('.pm-conversation-link');await page.keyboard.press('Enter');await page.waitForSelector('#player-message-body');
}finally{await page.close();}});

test('clicking a cell opens the chat once; private and group types have distinct colours',async()=>{const page=await open();try{
 const colours=await page.$$eval('.pm-type',nodes=>[getComputedStyle(nodes[0]).color,getComputedStyle(nodes[1]).color]);assert.notEqual(colours[0],colours[1]);
 await page.click('.pm-table tbody tr:first-child td:nth-child(6)');await page.waitForSelector('#player-message-body');
 assert.equal(await page.evaluate(()=>window.__calls.filter(c=>c.action==='read').length),1);
 await click(page,'Back to conversations');await page.waitForSelector('.pm-table');await page.click('.pm-conversation-link');await page.waitForSelector('#player-message-body');
 assert.equal(await page.evaluate(()=>window.__calls.filter(c=>c.action==='read').length),2);
}finally{await page.close();}});
test('verified Super Admin scope capability explains that organisation links are optional',async()=>{const page=await browser.newPage();try{
 await page.setContent('<div id="root"></div>');await page.evaluate(()=>window.__globalAudience=true);await page.addScriptTag({path:output});await page.waitForSelector('.pm-conversation-link');
 await click(page,'New message');await chooseOrg(page);assert.match(await page.$eval('body',n=>n.textContent),/even if they are not linked to it/);
}finally{await page.close();}});
