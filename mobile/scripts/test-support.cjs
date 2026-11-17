const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/support.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:mod.exports,module:mod});
const {supportEmailUrl,SUPPORT_EMAIL}=mod.exports;
test('enquiries target the confirmed inbox and preserve multiline messages and selected reference',()=>{
 const url=new URL(supportEmailUrl({topic:'Payment or refund',message:'Paid twice & need help\nReference #123',context:'Tournament (event #4)',email:'player@example.com',name:'A Player'}));
 assert.equal(url.pathname,SUPPORT_EMAIL);assert.equal(SUPPORT_EMAIL,'info@4mpadel.co.za');
 assert.equal(url.searchParams.get('subject'),'4M app — Payment or refund');
 const body=url.searchParams.get('body');assert.match(body,/Paid twice & need help\nReference #123/);assert.match(body,/event #4/);assert.match(body,/Account email: player@example.com/);
});
test('user-entered URI punctuation cannot add mail recipients',()=>{
 const url=new URL(supportEmailUrl({topic:'Other',message:'&bcc=someone@example.com?subject=hello'}));
 assert.equal(url.searchParams.get('bcc'),null);assert.match(url.searchParams.get('body'),/&bcc=someone@example.com/);
});
test('organiser email fallback keeps the request reference and rejects header injection',()=>{
 const url=new URL(supportEmailUrl({recipient:'organiser@example.com',topic:'Entry · 4M-ABCDEF1234',message:'Please help',context:'4M-ABCDEF1234 · event #100'}));
 assert.equal(url.pathname,'organiser@example.com');assert.match(url.searchParams.get('subject'),/4M-ABCDEF1234/);assert.match(url.searchParams.get('body'),/event #100/);
 for(const recipient of ['a@example.com\nBcc:someone@example.com','a@example.com?cc=someone@example.com','a@example.com,b@example.com']) assert.throws(()=>supportEmailUrl({recipient,topic:'Help',message:'Hello'}));
});
test('valid local-part punctuation stays in the email address and cannot become URI headers',()=>{
 const recipient='help?tag&copy#box%code@example.com',url=new URL(supportEmailUrl({recipient,topic:'Help',message:'Entry question'}));
 assert.equal(decodeURIComponent(url.pathname),recipient);assert.equal(url.hash,'');assert.deepEqual([...url.searchParams.keys()],['subject','body']);
});
const related={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/support-related.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:related.exports,module:related,require:()=>({})});
test('entry picker keeps past support context, dates, locations and stable event references',()=>{
 const events=[{id:1,event_name:'Future Cup 🏆',start_date:'2026-11-20',end_date:'2026-11-22',venue:'Café Courts',city:'Durban',isRegistered:true},{id:2,event_name:'Past Cup',start_date:'2026-03-01',isRegistered:true},{id:3,event_name:'Not entered',start_date:'2026-11-21',isRegistered:false}];
 const options=related.exports.entrySupportOptions([...events,events[0]],'2026-11-13');
 assert.equal(options.length,2);assert.equal(options[0].label,'Future Cup');assert.equal(options[0].value,'Future Cup 🏆 (event #1)');assert.equal(options[0].eventId,1);assert.match(options[0].detail,/2026/);assert.equal(options[0].group,'Current & upcoming');assert.equal(options[1].group,'Past entries');
 assert.equal(related.exports.filterSupportOptions(options,'durban cafe').length,1);assert.equal(related.exports.filterSupportOptions(options,'2026 cup').length,2);assert.equal(related.exports.filterSupportOptions(options,'durban unknown').length,0);
});

const entrySupport={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/support-entry.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:entrySupport.exports,module:entrySupport});
test('Manage entry help links carry only validated event and entry references',()=>{
 const id='96000000-0000-0000-0000-000000000001';
 assert.deepEqual(JSON.parse(JSON.stringify(entrySupport.exports.supportEntryTarget('553',id))),{topic:'entry',eventId:553,entryId:id});
 for(const event of ['0','-1','1e2','9007199254740992',undefined]) assert.equal(entrySupport.exports.supportEntryTarget(event,id),null);
 assert.equal(entrySupport.exports.supportEntryTarget('553','other-user'),null);
});
test('direct entry context requires an authoritative server response before it can be preselected',()=>{
 assert.throws(()=>entrySupport.exports.supportEntryOption({eventId:553,eventName:'Event'}));
 const option=entrySupport.exports.supportEntryOption({eventId:553,eventName:'Event',entryId:'entry',entryDetail:'Open · Alice · Bob',context:'Canonical entry context'});
 assert.equal(option.value,'Canonical entry context');assert.equal(option.entryId,'entry');assert.match(option.detail,/Alice/);
});
