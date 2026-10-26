import test from 'node:test';
import assert from 'node:assert/strict';
import {financeStatusTone,financeAmountTone,sortFinanceRows} from '../../src/pages/admin-preview/financePresentation.js';
test('sorting is numeric, stable for ties, and does not mutate the source',()=>{
 const rows=[{id:'b',amount:100},{id:'a',amount:100},{id:'c',amount:-55000}];
 assert.deepEqual(sortFinanceRows(rows,{key:'amount',direction:'asc'}).map(r=>r.id),['c','a','b']);
 assert.deepEqual(sortFinanceRows(rows,{key:'amount',direction:'desc'}).map(r=>r.id),['a','b','c']);
 assert.equal(rows[0].id,'b');
});
test('date sorting respects timestamp offsets and keeps missing dates last',()=>{
 const rows=[{id:1,date:'2026-09-01T22:00:00Z'},{id:2,date:'2026-09-02T01:00:00+02:00'},{id:3,date:null}];
 assert.deepEqual(sortFinanceRows(rows,{key:'date',direction:'desc'}).map(r=>r.id),[2,1,3]);
 assert.deepEqual(sortFinanceRows(rows,{key:'date',direction:'asc'}).map(r=>r.id),[1,2,3]);
});
test('status styling separates processed refunds, success, pending and unknown states',()=>{
 assert.equal(financeStatusTone('success'),'positive');
 assert.equal(financeStatusTone(' PROCESSED '),'info');
 assert.equal(financeStatusTone('pending'),'warning');
 assert.equal(financeStatusTone('processing'),'warning');
 assert.equal(financeStatusTone('failed'),'danger');
 assert.equal(financeStatusTone('unrecognised'),'neutral');
});
test('amount colour follows the numeric sign, including neutral zero',()=>{
 assert.equal(financeAmountTone(-55000),'negative');
 assert.equal(financeAmountTone(65000),'positive');
 assert.equal(financeAmountTone(0),'neutral');
});
