import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRecordedPaystackPayments,filterRecordedPayments,sortRecordedPayments,loadRecordedRefunds,recordedRefundReason} from '../../src/pages/admin-preview/paymentsData.js';
const session={user:{id:'admin'}},permissions={role:'super_admin'};
test('refund loader uses exact payment ID, all statuses and minimal paginated reads',async()=>{
 const rows=[{id:1,status:'failed'},{id:2,status:'pending'}];let calls=0;
 const client={from(table){assert.equal(table,'payment_refunds');return {select(fields){assert.equal(fields,'id,payment_id,amount,status,created_at,processed_at,reason,paystack_refund_id,paystack_reference');return this;},eq(field,id){assert.equal(field,'payment_id');assert.equal(id,463);return this;},order(){return this;},range(offset){calls++;return Promise.resolve({data:rows.slice(offset,offset+1)});}};}};
 assert.deepEqual(await loadRecordedRefunds(client,session,permissions,'all',463),rows);assert.equal(calls,3);
});
test('refund reasons preserve recorded meaning without inferring financial outcomes',()=>{
 assert.equal(recordedRefundReason('admin_cash_refund'),'Admin cash refund');
 assert.equal(recordedRefundReason('division_cancellation'),'Division cancellation');
 assert.equal(recordedRefundReason('owner_removed_partner'),'Owner removed partner');
 assert.equal(recordedRefundReason('custom_future_reason'),'Custom future reason');
 assert.equal(recordedRefundReason(null),'Not recorded');
});
test('refund loader denies unauthorised, missing-ID and cancelled requests before querying',async()=>{
 const client={from(){throw new Error('Unexpected query');}};
 await assert.rejects(loadRecordedRefunds(client,session,permissions,'org:1',1),/access is required/);
 await assert.rejects(loadRecordedRefunds(client,session,permissions,'all',null),/ID is required/);
 const controller=new AbortController();controller.abort();
 await assert.rejects(loadRecordedRefunds(client,session,permissions,'all',1,controller.signal),{name:'AbortError'});
});
test('payment sorts use numeric amounts and keep unavailable values last in both directions',()=>{
 const rows=[{id:1,amount:'100'},{id:2,amount:'9'},{id:3,amount:null},{id:4,amount:'bad'},{id:5,amount:-2}];
 assert.deepEqual(sortRecordedPayments(rows,'amount-asc').map(r=>r.id),[5,2,1,3,4]);
 assert.deepEqual(sortRecordedPayments(rows,'amount-desc').map(r=>r.id),[1,2,5,3,4]);
 assert.deepEqual(rows.map(r=>r.id),[1,2,3,4,5]);
});
test('payment name and timestamp sorts preserve identity with deterministic ties',()=>{
 const rows=[{id:1,players:{name:'Zed'},calendar:{event_name:'Alpha'},created_at:'2026-09-08T01:00:00+02:00'},{id:2,players:{name:'Amy'},calendar:{event_name:'Beta'},created_at:'2026-09-08T00:00:00Z'},{id:3}];
 assert.deepEqual(sortRecordedPayments(rows,'player-asc').map(r=>r.id),[2,1,3]);
 assert.deepEqual(sortRecordedPayments(rows,'event-desc').map(r=>r.id),[2,1,3]);
 assert.deepEqual(sortRecordedPayments(rows,'date-desc').map(r=>r.id),[2,1,3]);
});
test('recorded payments require platform super-admin before querying',async()=>{
 const client={from(){throw new Error('Unexpected query');}};
 for(const [user,role,scope] of [[null,permissions,'all'],[session,{role:'custom'},'all'],[session,permissions,'org:1']])await assert.rejects(loadRecordedPaystackPayments(client,user,role,scope),/access is required/);
});
test('recorded payment loader reads every short page using minimal fields and method restriction',async()=>{
 const source=Array.from({length:31},(_,id)=>({id}));let calls=0;
 const client={from(table){assert.equal(table,'payments');return {
 select(fields){assert.ok(!fields.includes('*') && !fields.includes('metadata') && !fields.includes('email'));assert.ok(fields.includes('players!payments_player_id_fkey(id,name,image_url)'));assert.ok(fields.includes('calendar!payments_event_id_fkey(id,event_name)'));return this;},
 eq(field,value){assert.equal(field,'payment_method');assert.equal(value,'paystack');return this;},
 order(field){assert.equal(field,'id');return this;},range(offset){calls++;return Promise.resolve({data:source.slice(offset,offset+7)});}
 };}};
 const progress=[];
 assert.deepEqual(await loadRecordedPaystackPayments(client,session,permissions,'all',undefined,count=>progress.push(count)),source);assert.equal(calls,6);
 assert.deepEqual(progress,[0,7,14,21,28,31]);
});
test('filters distinguish test, live and unknown flags and combine status/search/SA dates',()=>{
 const rows=[{id:1,is_test:false,status:'success',reference:'REF-1',created_at:'2026-09-07T23:00:00Z'},{id:2,is_test:true,status:'failed'},{id:3,is_test:null,status:'pending'}];
 assert.deepEqual(filterRecordedPayments(rows).map(r=>r.id),[1]);
 assert.deepEqual(filterRecordedPayments(rows,{environment:'unknown'}).map(r=>r.id),[3]);
 assert.deepEqual(filterRecordedPayments(rows,{environment:'test',status:'failed'}).map(r=>r.id),[2]);
 assert.equal(filterRecordedPayments(rows,{query:'ref-1',from:'2026-09-08',to:'2026-09-08'}).length,1);
 assert.equal(filterRecordedPayments(rows,{environment:'all',from:'2026-09-09'}).length,0);
 assert.equal(rows.length,3);
});

test('player and event name search uses joined records without losing missing links',()=>{
 const rows=[{id:1,is_test:false,player_id:123,event_id:463,players:{name:'Alex Example'},calendar:{event_name:'Coastal Open'}},{id:2,is_test:false,player_id:456,event_id:789,players:null,calendar:null}];
 assert.deepEqual(filterRecordedPayments(rows,{query:'ALEX'}).map(row=>row.id),[1]);
 assert.deepEqual(filterRecordedPayments(rows,{query:'coastal open'}).map(row=>row.id),[1]);
 assert.deepEqual(filterRecordedPayments(rows,{query:'456'}).map(row=>row.id),[2]);
 assert.equal(filterRecordedPayments(rows).length,2);
});
