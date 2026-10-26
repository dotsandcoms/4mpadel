import test from 'node:test';
import assert from 'node:assert/strict';
import { paymentMetadataReview, loadPaymentMetadataReview, recordedLineItemAmount } from '../../src/pages/admin-preview/paymentMetadataReview.js';
test('recorded amounts accept safe decimals and zero without coercion or silent precision loss',()=>{
  for(const value of ['0x10','1e3','1.001','', ' ', true, null, undefined, NaN, Infinity, 1e30, '9007199254740991.00','90071992547409.91']) assert.equal(recordedLineItemAmount(value),null,String(value));
  for(const [value, expected] of [[0,0],['0.00',0],['500.25',500.25],[-12.5,-12.5],['10',10]]) assert.equal(recordedLineItemAmount(value),expected);
  const result=paymentMetadataReview({line_items:[{amount:'1.001'}]});assert.equal(result.lineItems[0].amount,null);assert.match(result.warnings[0],/two decimal places/);
});
test('outer metadata takes source precedence without inferring coverage from amount',()=>{
  const result=paymentMetadataReview(JSON.stringify({original_trx:{id:'OLD',metadata:{source:'nested',covers:[{email:'old@example.invalid',type:'entry'}]}},source:'manual_event',covers:[{email:'partner@example.invalid',division:'Open',type:'license',license:'full',license_year:2026}],payment_classification:{payment_type:'event_entry_fee'},inherited_covers_from_sibling:true}));
  assert.equal(result.source,'manual_event');assert.equal(result.covers.length,1);assert.equal(result.covers[0].email,'partner@example.invalid');assert.equal(result.covers[0].licenseYear,'2026');assert.equal(result.originalReference,'OLD');assert.equal(result.inheritedCovers,true);assert.equal(result.classification,'event_entry_fee');assert.equal('total' in result,false);
  assert.equal(paymentMetadataReview({amount:450}).covers.length,0);
});
test('malformed records remain visible as warnings without exposing arbitrary metadata',()=>{
  assert.match(paymentMetadataReview('{bad').warnings[0],/valid JSON/);
  const result=paymentMetadataReview({covers:[null,{email:'x',type:'unknown'}],line_items:[{amount:false},{amount:'',player:'Example'},{amount:0}],secret:'do not expose'});
  assert.equal(result.lineItems[0].amount,null);assert.equal(result.lineItems[1].amount,null);assert.equal(result.lineItems[2].amount,0);assert.ok(result.warnings.length);assert.equal('secret' in result,false);
});
test('loader is exact SELECT-only, denied scope never queries, aborted result discarded',async()=>{
  const calls=[];const client={from:table=>{calls.push(table);const query={select:fields=>{calls.push(fields);return query;},eq:(key,value)=>{calls.push([key,value]);return query;},single:async()=>({data:{id:4,metadata:{source:'recorded'}}})};return query;}};
  const session={user:{id:'actor'}},permissions={role:'super_admin'};
  await assert.rejects(loadPaymentMetadataReview(client,session,permissions,'club:1',4));assert.equal(calls.length,0);
  const result=await loadPaymentMetadataReview(client,session,permissions,'all',4);assert.equal(result.source,'recorded');assert.deepEqual(calls,['payments','id,reference,payment_type,metadata',['id',4]]);
  const signal=AbortSignal.abort();await assert.rejects(loadPaymentMetadataReview(client,session,permissions,'all',4,signal),/Cancelled/);
});
