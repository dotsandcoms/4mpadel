import { test } from 'node:test';
import assert from 'node:assert/strict';
import { incomePayments, ledgerRegistrations, sessionIdentity } from '../../src/pages/admin-preview/eventLedger.js';
test('token refresh preserves data-load identity but account changes do not',()=>{
  const a={user:{id:'a',email:'a@test'},access_token:'old'};
  assert.equal(sessionIdentity(a),sessionIdentity({...a,access_token:'new'}));
  assert.notEqual(sessionIdentity(a),sessionIdentity({user:{id:'b',email:'b@test'}}));
  assert.notEqual(sessionIdentity(a),sessionIdentity(null));
});
test('abandoned attempts are excluded without hiding other payment states',()=>{
  assert.deepEqual(incomePayments([{status:'abandoned'},{status:'success'},{status:'processing'}]).map(p=>p.status),['success','processing']);
});
test('ledger finds refund registration and payment metadata covers',()=>{
  const regs=[{id:'r',email:'a@test',division:'Open'},{id:'s',email:'b@test',division:'Open'}];
  assert.deepEqual(ledgerRegistrations({_kind:'refund',event_registration_id:'s'},regs,[]),[regs[1]]);
  assert.deepEqual(ledgerRegistrations({status:'success',metadata:{covers:[{type:'entry',email:'a@test',division:'Open'},{type:'entry',email:'b@test',division:'Open'}]}},regs,[]),regs);
});
