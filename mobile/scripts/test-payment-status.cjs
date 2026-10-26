const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/payment-status.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:mod.exports,module:mod});
const {paymentStatus}=mod.exports;
test('unsuccessful and unknown attempts never imply a refundable successful payment',()=>{
 for(const state of ['Abandoned','Failed','Cancelled','pending','unexpected']) {
  const result=paymentStatus(state,'payment');assert.notEqual(result.label,'Success');assert.match(result.note,/not.*successful/);
 }
});
test('success, partial refunds, full refunds and refund records remain distinct',()=>{
 assert.equal(paymentStatus('success','payment').label,'Success');
 assert.equal(paymentStatus('success','payment',100).label,'Partially refunded');
 assert.equal(paymentStatus('Refunded','payment').label,'Refunded');
 assert.match(paymentStatus('Processed','refund').note,/refund record, not a new payment/);
});
