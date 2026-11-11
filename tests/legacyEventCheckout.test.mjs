import test from 'node:test';
import assert from 'node:assert/strict';
import {legacyEventCheckout} from '../src/utils/legacyEventCheckout.js';
const base={event:{id:101,event_name:'4M Open'},profile:{id:1},email:'PLAYER@example.test',name:'Player',phone:'123',divisions:['Open'],partners:{},feeFor:()=>300,reference:'ref-1',isTest:false,commerce:{event_fee_percent:0}};
test('legacy checkout saves pending rows and the amount/covers the UI reviewed',()=>{
 const p=legacyEventCheckout(base);assert.equal(p.status,'processing');assert.equal(p.amount,300);assert.equal(p.metadata.registrant_email,'player@example.test');assert.equal(p.metadata.registration_rows[0].payment_status,'pending');assert.equal(p.metadata.covers.length,1);
});
test('paying for a partner creates a reciprocal pair and separate covers',()=>{
 const p=legacyEventCheckout({...base,partners:{Open:{payForPartner:true,partnerProfile:{name:'Partner',email:'partner@example.test'}}}});
 assert.equal(p.amount,600);assert.equal(p.metadata.covers.length,2);assert.equal(p.metadata.registration_rows[1].registered_by,'player@example.test');assert.equal(p.metadata.registration_rows[1].partner_email,'player@example.test');
});
test('multiple divisions retain separate covers and reject invalid fees',()=>{
 const p=legacyEventCheckout({...base,divisions:['Open','Advanced'],feeFor:d=>d==='Open'?300:400});assert.equal(p.amount,700);assert.equal(p.metadata.covers.length,2);assert.throws(()=>legacyEventCheckout({...base,feeFor:()=>NaN}));
});
