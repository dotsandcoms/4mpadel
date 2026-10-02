const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), ts=require('typescript'), vm=require('node:vm');
const path='src/app/(tabs)/(calendar)/events/[id].tsx';
const file=ts.createSourceFile(path,fs.readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let handler;
function visit(n){if(ts.isJsxSelfClosingElement(n)&&n.tagName.getText(file)==='RegistrationCountdown'){handler=n.attributes.properties.find(p=>p.name?.getText(file)==='onRegister').initializer.expression.getText(file);}ts.forEachChild(n,visit);}visit(file);
function press(registrations){const actions=[];const fn=vm.runInNewContext('('+handler+')',{registrations,setTab:v=>actions.push(['tab',v]),setManageRequested:v=>actions.push(['manage',v]),register:()=>actions.push(['register'])});fn();return actions;}
test('countdown Manage Entry opens native sheet for existing entries without a browser',()=>{assert.deepEqual(press([{id:'r1',payment_status:'paid'}]),[['tab','Overview'],['manage',true]]);});
test('countdown Register still starts registration for a player without an entry',()=>{assert.deepEqual(press([]),[['register']]);});
