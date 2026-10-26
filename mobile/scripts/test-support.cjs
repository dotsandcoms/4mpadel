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
