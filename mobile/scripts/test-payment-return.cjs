const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');const vm=require('node:vm');
const exportsObject={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/payment-return.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:exportsObject,URL});
const reference='MOBILE-12345678-11111111-1111-1111-1111-111111111111';
const valid=`fourmpadel://events/register?id=553&pay_ref=${reference}&payment_return=1`;
test('recognizes the exact native payment return and optional pay mode',()=>{const result=exportsObject.parsePaymentReturn(valid+'&mode=pay');assert.equal(result.eventId,'553');assert.equal(result.reference,reference);assert.equal(result.mode,'pay');});
test('unrelated links and malformed returns cannot dismiss the payment browser',()=>{for(const url of ['https://example.com',valid.replace('fourmpadel:','https:'),valid.replace('/register','/register-other'),valid.replace('id=553','id=bad'),valid.replace(reference,'other-payment'),valid.replace('payment_return=1','payment_return=0')])assert.equal(exportsObject.parsePaymentReturn(url),null);});
