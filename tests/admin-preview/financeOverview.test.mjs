import test from 'node:test';
import assert from 'node:assert/strict';
import {financeOverview,canReadFinanceOverview,loadFinanceOverview,financePeriod,financeDate,financeTypeEntries,loadFinancePaymentLinks} from '../../src/pages/admin-preview/financeOverviewData.js';
const payments = [
 {id:1,amount:'600.10',status:'success',payment_type:'event_entry_fee',created_at:'2025-12-01'},
 {id:2,amount:'120.20',status:'success',payment_type:'temp_license',created_at:'2026-01-01'},
 {id:3,amount:900,status:'success',is_test:true},
 {id:4,amount:900,status:'pending'},
];
const refunds = [{payment_id:1,amount:100,status:'pending',created_at:'2026-02-01'}, {payment_id:1,amount:50,status:'failed'}, {payment_id:3,amount:900,status:'success'}, {payment_id:999,amount:900,status:'success'}];
test('type drilldown reconciles refunds of prior-year receipts without repeating receipts',()=>{
 const entries=financeTypeEntries(payments,refunds,'event_entry_fee','2026');
 assert.equal(entries.length,1);assert.equal(entries[0].kind,'Refund');assert.equal(entries[0].amount,-10000);
 assert.equal(financeTypeEntries(payments,refunds,'temp_license','2026')[0].amount,12020);
});
test('combined ledger reconciles all types and retains original refund classification',()=>{
 const entries=financeTypeEntries(payments,refunds,undefined,'2026');
 assert.equal(entries.length,2);
 assert.equal(entries.reduce((sum,e)=>sum+e.amount,0),financeOverview(payments,refunds,'2026').totals.net);
 assert.equal(entries.find(e=>e.kind==='Refund').paymentType,'event_entry_fee');
 assert.equal(entries.find(e=>e.kind==='Receipt').paymentType,'temp_license');
});
test('linked details do not query for an empty selection or unauthorized identity',async()=>{
 const client={from(){throw Error('Unexpected query');}};
 assert.deepEqual(await loadFinancePaymentLinks(client,{user:{id:'test'}},{role:'super_admin'},'all',[]),[]);
 await assert.rejects(loadFinancePaymentLinks(client,{user:{id:'test'}},{role:'custom'},'all',[1]),/access is required/);
});
test('monthly comparison handles January rollover and leap February',()=>{
 assert.deepEqual(financePeriod({mode:'month',month:'2026-01'}).previous,{from:'2025-12-01',to:'2025-12-31'});
 assert.deepEqual(financePeriod({mode:'month',month:'2024-02'}).filter,{from:'2024-02-01',to:'2024-02-29'});
});
test('custom range validates dates and includes both South African boundary days',()=>{
 assert.throws(()=>financePeriod({mode:'range',from:'2026-02-30',to:'2026-03-01'}));
 assert.throws(()=>financePeriod({mode:'range',from:'2026-03-02',to:'2026-03-01'}));
 assert.equal(financeDate('2026-01-31T23:00:00Z'),'2026-02-01');
 const filter=financePeriod({mode:'range',from:'2026-02-01',to:'2026-02-01'}).filter;
 const samples=['2026-01-31T21:59:59Z','2026-01-31T22:00:00Z','2026-02-01T21:59:59Z','2026-02-01T22:00:00Z'].map((created_at,id)=>({id,status:'success',amount:10,created_at}));
 assert.equal(financeOverview(samples,[],filter).totals.count,2);
});
test('finance totals exclude test and unsuccessful receipts and only link non-failed refunds',()=>{
 assert.deepEqual(financeOverview(payments,refunds).totals,{count:2,gross:72030,refunds:10000,net:62030});
});
test('refund in later year remains visible even if original payment is outside period',()=>{
 const report=financeOverview(payments,refunds,'2026');
 assert.deepEqual(report.totals,{count:1,gross:12020,refunds:10000,net:2020});
 assert.equal(report.rows.find(r=>r.type==='event_entry_fee').net,-10000);
});
test('missing monetary values fail rather than displaying misleading totals',()=>{
 assert.throws(()=>financeOverview([{id:1,status:'success',amount:null}],[]),/invalid/);
});
test('finance cannot request platform records for signed-out, restricted or tenant context',async()=>{
 const client={from:()=>{throw Error('Should never query');}};
 for(const [session,permissions,scope] of [[null,{role:'super_admin'},'all'],[{user:{id:'a'}},{role:'custom'},'all'],[{user:{id:'a'}},{role:'super_admin'},'org:1']]) {
  assert.equal(canReadFinanceOverview(session,permissions,scope),false);
  await assert.rejects(loadFinanceOverview(client,session,permissions,scope),/access is required/);
 }
});
