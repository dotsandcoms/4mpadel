import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveManualEntryPayment, unmarkManualEntryPayment } from '../../src/utils/manualEntryPayment.js';
function client() {
  const writes=[];
  return { writes, from(table) { return { update(value) { writes.push({table,value});return {eq:async()=>({error:null})}; }, select(){return {eq(){return {maybeSingle:async()=>({data:null,error:null})};}};}, async insert(value){writes.push({table,value});return {error:null};} }; } };
}
test('shared comp persistence writes R0 manual metadata and activity',async()=>{
  const db=client();let log;
  await saveManualEntryPayment({supabase:db,event:{id:1},reg:{id:2,email:'p@test',division:'Open',full_name:'Player'},method:'comp',note:'Sponsor',fee:500,logEventActivity:async row=>{log=row;}});
  const payment=db.writes[1].value[0];
  assert.equal(payment.amount,0);assert.equal(payment.payment_method,'manual');assert.equal(payment.metadata.comp_entry,true);assert.equal(payment.metadata.note,'Sponsor');assert.equal(log.action,'admin.comped_entry');
});
test('blank notes do not write',async()=>{
  const db=client();await assert.rejects(saveManualEntryPayment({supabase:db,reg:{},method:'comp',note:' '}));assert.equal(db.writes.length,0);
});
test('comp reversal returns the entry to pending and cancels the ledger row without deleting it', async () => {
  const db = client(); let log;
  await unmarkManualEntryPayment({
    supabase: db, event: { id: 1 }, reg: { id: 2, email: 'p@test', full_name: 'Player', division: 'Open' },
    payments: [{ id: 3, reference: 'MANUAL-ADMIN-COMP-2', status: 'success', metadata: { comp_entry: true, note: 'Sponsor' } }],
    logEventActivity: async row => { log = row; },
  });
  assert.deepEqual(db.writes[0], { table: 'event_registrations', value: { payment_status: 'pending', payment_method: null } });
  assert.equal(db.writes[1].table, 'payments');
  assert.equal(db.writes[1].value.status, 'cancelled');
  assert.equal(db.writes[1].value.metadata.note, 'Sponsor');
  assert.equal(db.writes[1].value.metadata.unmarked_by_admin, true);
  assert.equal(log.action, 'admin.unmarked_paid');
});
