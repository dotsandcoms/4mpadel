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
test('a refunded checkout stays with the archived entry when the player re-enters unpaid',()=>{
 const original=reg('archived','__archived__/archived','withdrawn','refunded');
 const replacement=reg('replacement','Open','registered','pending');
 const p=pay('old',550,{covers:[{type:'entry',email:replacement.email,division:'Open'}],line_items:[{label:'Player — Open',amount:550}],division_entry_fees:{Open:550}});
 const refunds=[{payment_id:p.id,event_registration_id:original.id,status:'processed',amount:550,metadata:{cover_type:'entry'}}];
 assert.equal(findFinancePayment([p],replacement,refunds),null);
 assert.equal(findFinancePayment([p],original,refunds),p);
 const rows=buildFinanceAllocations([replacement,original],[p],refunds);
 assert.deepEqual(rows.map(row=>[row.registration?.id,row.payment.id,row.amount]),[['archived','old',550]]);
 assert.equal(replacement.payment_status,'pending');
});
test('a fresh same-division checkout funds the replacement without reusing the refunded receipt',()=>{
 const original=reg('archived','__archived__/archived','withdrawn','refunded');
 const replacement=reg('replacement');
 const covers=[{type:'entry',email:replacement.email,division:'Open'}];
 const old=pay('old',550,{covers});
 const current=pay('current',600,{covers});
 const refunds=[{payment_id:old.id,event_registration_id:original.id,status:'processed',amount:550,metadata:{cover_type:'entry'}}];
 assert.equal(findFinancePayment([old,current],replacement,refunds),current);
 const rows=buildFinanceAllocations([replacement,original],[old,current],refunds);
 assert.deepEqual(rows.map(row=>[row.registration?.id,row.payment.id,row.amount]),[['archived','old',550],['replacement','current',600]]);
});
test('several entry refunds reserve the full receipt, but failed and license refunds do not',()=>{
 const p=pay('p',550,{covers:[{type:'entry',email:'player@example.test',division:'Open'}]});
 const replacement=reg('replacement');
 const refund=(amount,status='processed',cover_type='entry')=>({payment_id:p.id,event_registration_id:'old',amount,status,metadata:{cover_type}});
 assert.equal(findFinancePayment([p],replacement,[refund(300),refund(250)]),null);
 assert.equal(findFinancePayment([p],replacement,[refund(550,'pending')]),null);
 assert.equal(findFinancePayment([p],replacement,[refund(550,'failed')]),p);
 assert.equal(findFinancePayment([p],replacement,[refund(550,'processed','license')]),p);
});
test('a partially refunded team checkout still allocates the other player entry',()=>{
 const first=reg('first','Open','withdrawn','refunded');
 const second={...reg('second'),email:'partner@example.test',full_name:'Partner'};
 const p=pay('team',1100,{covers:[first,second].map(r=>({type:'entry',email:r.email,division:r.division})),division_entry_fees:{Open:550}});
 const refunds=[{payment_id:p.id,event_registration_id:first.id,status:'processed',amount:550,metadata:{cover_type:'entry'}}];
 assert.equal(findFinancePayment([p],second,refunds),p);
 assert.deepEqual(buildFinanceAllocations([first,second],[p],refunds).map(row=>[row.registration?.id,row.amount]),[['first',550],['second',550]]);
});
test('unallocated receipts stay visible and allocations cannot exceed cash',()=>{
 const p=pay('p',600,{covers:[{type:'entry',email:'player@example.test',division:'Open'}]});
 assert.equal(buildFinanceAllocations([], [p])[0].amount,600);
 assert.throws(()=>buildFinanceAllocations([reg('one'),reg('two')],[p]),/allocated more than once/);
});
test('refund queries are batched and duplicates deduplicated',async()=>{
 const calls=[];const db={from:()=>({select:()=>({in:(column,ids)=>{calls.push(ids);return {order:()=>({range:async()=>({data:[{id:'r',event_registration_id:'refunded',status:'processed'}]})})};}})})};
 const rows=await loadEventRefunds(db,Array.from({length:65},(_,i)=>({id:`r${i}`})),[{id:'p'}]);
 assert.deepEqual(calls.map(c=>c.length),[30,30,5,1]);assert.equal(rows.length,1);
});
test('refund errors and hidden records cannot produce a zero-refund export',async()=>{
 const db={from:()=>({select:()=>({in:()=>({order:()=>({range:async()=>({error:{message:'request failed'}})})})})})};
 await assert.rejects(loadEventRefunds(db,[{id:'r'}],[]),/request failed/);
 const hidden={from:()=>({select:()=>({in:()=>({order:()=>({range:async()=>({data:[]})})})})})};
 await assert.rejects(loadEventRefunds(hidden,[{id:'r',payment_status:'refunded'}],[]),/missing/);
});

test('refunds linked only by original reference are loaded and retained across all pages', async () => {
 const rows=Array.from({length:1001},(_,i)=>({id:`f${i}`,paystack_reference:'REGEV-original',status:'processed',amount:1}));
 const columns=[];const db={from:()=>({select:()=>({in:(column,ids)=>{columns.push(column);return {order:()=>({range:async(from,to)=>({data:column==='paystack_reference'&&ids.includes('REGEV-original')?rows.slice(from,to+1):[]})})};}})})};
 const result=await loadEventRefunds(db,[],[{id:'new-ledger-id',reference:'REGEV-original'}]);
 assert.equal(result.length,1001);assert.ok(columns.includes('paystack_reference'));
});
