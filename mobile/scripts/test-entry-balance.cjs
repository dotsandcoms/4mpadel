const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript'), vm = require('node:vm');
function load(path) { const exports = {}; vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports, require: () => ({}) }); return exports; }
const {entryBalance} = load('supabase/functions/native-entry-balance/balance.ts');
const {paymentPresentation} = load('src/lib/payment-presentation.ts');
test('a confirmed historical payment remains confirmed when itemised balance data is unavailable', () => {
  const state = paymentPresentation('paid', { known: false, due: null });
  assert.equal(state.confirmed, true); assert.equal(state.label, 'Paid & Confirmed'); assert.equal(state.due, null);
  assert.equal(paymentPresentation('paid').confirmed, true);
});
test('only a verified positive balance supersedes the paid registration badge', () => {
  assert.equal(paymentPresentation('paid', { known: true, due: 50 }).due, 50);
  assert.equal(paymentPresentation('paid', { known: true, due: 50 }).confirmed, false);
  assert.equal(paymentPresentation('paid', { known: false, due: 50 }).confirmed, true);
  assert.equal(paymentPresentation('paid', { known: true, due: 0 }).confirmed, true);
});
test('pending, complimentary, refunded and missing statuses remain distinct', () => {
  assert.equal(paymentPresentation('pending').confirmed, false);
  assert.equal(paymentPresentation('comped').confirmed, true);
  assert.equal(paymentPresentation('comped', { known: true, due: 600 }).confirmed, true);
  assert.equal(paymentPresentation('refunded').label, 'Refunded');
  assert.equal(paymentPresentation(null).label, 'Status unavailable');
});
const {resolveRefundableItems} = load('supabase/functions/paystack-refund/refund-engine.ts');
const reg = { id:'r1',email:'me@example.com',division:'Open',payment_status:'paid' };
const original = {id:'p1',amount:1,status:'success',reference:'original',metadata:{source:'manual_event',covers:[{type:'entry',email:reg.email,division:'Open'}],division_entry_fees:{Open:1}}};
const extra = {id:'p2',amount:0.5,status:'success',reference:'balance',metadata:{source:'native_entry_balance',registration_id:'r1',division:'Open',verified_balance:true,covers:[{type:'entry',email:reg.email,division:'Open'}],division_entry_fees:{Open:0.5}}};
test('R1 paid and R1.50 current price leaves exactly R0.50 due',()=>{const b=entryBalance({entry_fee:1.5},null,reg,[original]);assert.equal(b.paid,1);assert.equal(b.due,0.5);});
test('verified adjustment clears the balance and retries do not compound original credit',()=>{assert.equal(entryBalance({}, {entry_fee:1.5},reg,[original,extra]).due,0);assert.equal(entryBalance({}, {entry_fee:1.5},reg,[original,{...original,id:'duplicate'}]).due,0.5);});
test('partner, licence, service fees and pending or test payments never inflate entry credit',()=>{const p={...original,amount:100,metadata:{...original.metadata,covers:[...original.metadata.covers,{type:'license',email:reg.email},{type:'entry',email:'partner@example.com',division:'Open'}]}};assert.equal(entryBalance({entry_fee:1.5},null,reg,[p,{...extra,status:'processing'},{...extra,is_test:true}]).due,0.5);});
test('unitemised historical payments are not guessed or charged again',()=>{const b=entryBalance({entry_fee:1.5},null,reg,[]);assert.equal(b.known,false);assert.equal(b.due,null);});
test('withdrawal refunds original entry and verified balance adjustment, each once',()=>{const items=resolveRefundableItems(reg,[original,extra],[]);assert.equal(items.reduce((s,i)=>s+i.refund_amount_rands,0),1.5);const retried=resolveRefundableItems(reg,[original,extra],[{payment_id:'p1',amount:1,status:'processed'},{payment_id:'p2',amount:0.5,status:'processed'}]);assert.equal(retried.length,0);});
