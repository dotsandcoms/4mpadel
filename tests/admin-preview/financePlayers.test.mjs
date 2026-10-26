import test from 'node:test';
import assert from 'node:assert/strict';
import {financePlayerSummary,financeEventSummary} from '../../src/pages/admin-preview/financeOverviewData.js';

test('event summary separates same-name events and attributes refunds without duplicating receipts',()=>{
 const entries=[{paymentId:1,kind:'Receipt',amount:12000},{paymentId:1,kind:'Refund',amount:-6000},{paymentId:2,kind:'Receipt',amount:5000},{paymentId:3,kind:'Receipt',amount:1000}];
 const links=new Map([['1',{calendar:{id:1,event_name:'Same event'}}],['2',{calendar:{id:2,event_name:'Same event'}}]]);
 const rows=financeEventSummary(entries,links);
 assert.equal(rows.length,3);
 assert.equal(rows.find(r=>r.key==='event:1').net,6000);
 assert.equal(rows.find(r=>r.key==='event:1').count,1);
 assert.equal(rows.find(r=>r.key==='event:2').net,5000);
 assert.equal(rows.reduce((sum,r)=>sum+r.net,0),12000);
});

test('player summary groups by verified ID, separates duplicate names and unlinked payments',()=>{
  const entries=[
    {paymentId:1,kind:'Receipt',amount:60000},
    {paymentId:1,kind:'Refund',amount:-12000},
    {paymentId:2,kind:'Receipt',amount:12000},
    {paymentId:3,kind:'Refund',amount:-6000},
    {paymentId:4,kind:'Receipt',amount:1000},
    {paymentId:5,kind:'Receipt',amount:2000},
  ];
  const links=new Map([
    ['1',{players:{id:'a',name:'Same name'}}],
    ['2',{players:{id:'a',name:'Same name'}}],
    ['3',{players:{id:'b',name:'Same name'}}],
    ['4',{players:null}],
  ]);
  const rows=financePlayerSummary(entries,links);
  assert.equal(rows.length,4);
  const first=rows.find(r=>r.key==='player:a');
  assert.deepEqual([first.count,first.gross,first.refunds,first.net],[2,72000,12000,60000]);
  assert.deepEqual([...first.paymentIds],['1','2']);
  assert.equal(rows.find(r=>r.key==='player:b').net,-6000);
  assert.equal(rows.reduce((sum,r)=>sum+r.net,0),entries.reduce((sum,e)=>sum+e.amount,0));
});

test('empty periods stay empty and names without IDs are not attributed',()=>{
  assert.deepEqual(financePlayerSummary([],new Map()),[]);
  const rows=financePlayerSummary([{paymentId:1,kind:'Receipt',amount:10}],new Map([['1',{players:{name:'Unverified name'}}]]));
  assert.equal(rows[0].key,'unlinked:1');
});
