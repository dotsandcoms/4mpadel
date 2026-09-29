import test from 'node:test';
import assert from 'node:assert/strict';
import { findFinancePayment, buildFinanceAllocations, loadEventRefunds } from '../src/utils/eventFinanceReconciliation.js';
const reg = (id, division='Open', status='registered', payment_status='paid') => ({id,email:'player@example.test',full_name:'Player',division,status,payment_status});
const pay = (id, amount, metadata, payment_method='paystack') => ({id,amount,metadata,payment_method,status:'success',payment_type:'event_entry_fee'});
test('replacement EFT wins over the older same-division Paystack checkout',()=>{
 const old=pay('old',650,{covers:[{type:'entry',email:'player@example.test',division:'Open'}]});
 const current=pay('new',600,{registration_id:'new-reg'},'eft');
 assert.equal(findFinancePayment([old,current],reg('new-reg')).id,'new');
});
test('explicit payment IDs do not match archived registrations by email',()=>{
 assert.equal(findFinancePayment([pay('p',600,{registration_id:'current'})],reg('archived','__archived__/old','withdrawn','pending')),null);
});
test('withdrawn pending divisions cannot borrow the active division payment',()=>{
 const p=pay('p',550,{covers:[{type:'entry',email:'player@example.test',division:'Open'}]});
 assert.equal(findFinancePayment([p],reg('old','Advanced','withdrawn','pending')),null);
 assert.equal(findFinancePayment([p],reg('active')).id,'p');
});
test('historical refunds and replacement collections are both allocated once',()=>{
 const old=pay('old',650,{covers:[{type:'entry',email:'player@example.test',division:'Open'}]});
 const current=pay('new',600,{registration_id:'current'},'eft');
 const refunds=[{id:'r',payment_id:'old',event_registration_id:'archived',status:'processed',amount:650,metadata:{cover_type:'entry'}}];
 const rows=buildFinanceAllocations([reg('current'),reg('archived','__archived__/old','withdrawn','refunded')],[old,current],refunds);
 assert.equal(rows.length,2);assert.equal(rows.reduce((s,r)=>s+r.amount,0),1250);
 assert.equal(findFinancePayment([old,current],reg('archived','__archived__/old','withdrawn','refunded'),refunds).id,'old');
});
test('partly refunded multi-division checkout retains both original entry portions',()=>{
 const p=pay('p',1200,{covers:['Open','Advanced'].map(division=>({type:'entry',email:'player@example.test',division})),division_entry_fees:{Open:600,Advanced:600}});
 const rows=buildFinanceAllocations([reg('one'),reg('two','Advanced','withdrawn','refunded')],[p],[{payment_id:'p',event_registration_id:'two',status:'processed',metadata:{cover_type:'entry'}}]);
 assert.deepEqual(rows.map(r=>r.amount),[600,600]);
});
test('unallocated receipts stay visible and allocations cannot exceed cash',()=>{
 const p=pay('p',600,{covers:[{type:'entry',email:'player@example.test',division:'Open'}]});
 assert.equal(buildFinanceAllocations([], [p])[0].amount,600);
 assert.throws(()=>buildFinanceAllocations([reg('one'),reg('two')],[p]),/allocated more than once/);
});
test('refund queries are batched and duplicates deduplicated',async()=>{
 const calls=[];const db={from:()=>({select:()=>({in:async(column,ids)=>{calls.push(ids);return {data:[{id:'r',event_registration_id:'refunded',status:'processed'}]};}})})};
 const rows=await loadEventRefunds(db,Array.from({length:65},(_,i)=>({id:`r${i}`})),[{id:'p'}]);
 assert.deepEqual(calls.map(c=>c.length),[30,30,5,1]);assert.equal(rows.length,1);
});
test('refund errors and hidden records cannot produce a zero-refund export',async()=>{
 const db={from:()=>({select:()=>({in:async()=>({error:{message:'request failed'}})})})};
 await assert.rejects(loadEventRefunds(db,[{id:'r'}],[]),/request failed/);
 const hidden={from:()=>({select:()=>({in:async()=>({data:[]})})})};
 await assert.rejects(loadEventRefunds(hidden,[{id:'r',payment_status:'refunded'}],[]),/missing/);
});
