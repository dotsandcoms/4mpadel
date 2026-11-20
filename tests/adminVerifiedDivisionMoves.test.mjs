import assert from 'node:assert/strict';
import test from 'node:test';
import { moveEventEntries } from '../src/utils/moveEventEntries.js';
import { findPaymentForRegistration, getRegistrationEntryFeePaid } from '../src/utils/paymentRegistrationMatch.js';
import { resolveRefundableItems, switchRegistrationDivision } from '../supabase/functions/paystack-refund/refund-engine.ts';

const event = { id: 17, event_name: 'Fixture Open' };
const source = { id: 'open', name: 'Open', entry_fee: 400 };
const target = { id: 'advanced', name: 'Advanced', entry_fee: 400 };
const cover = { type: 'entry', email: 'former@example.invalid', division: 'Open', division_id: 'open' };
const registration = { id: 'exact-slot', event_id: 17, email: 'replacement@example.invalid', full_name: 'Replacement',
  division: 'Open', division_id: 'open', status: 'registered', payment_status: 'paid' };
const before = { id: 'receipt', event_id: 17, amount: 400, status: 'success', payment_type: 'event_entry_fee',
  payment_method: 'paystack', reference: 'EVREG-FIXTURE-1', metadata: { source: 'manual_event', covers: [cover],
    division_entry_fees: { Open: 400, Advanced: 550 },
    verified_entry_transfers: [{ cover_position: 1, registration_id: registration.id, event_id: 17, division: 'Open', division_id: 'open' }] } };

test('a moved allocation gets its original price and exact refund reference in the new division', () => {
  const moved = { ...registration, division: target.name, division_id: target.id };
  const receipt = { ...before, metadata: { ...before.metadata, verified_entry_transfers: [{
    ...before.metadata.verified_entry_transfers[0], division: target.name, division_id: target.id,
    original_division: source.name, original_division_id: source.id,
  }] } };
  assert.equal(findPaymentForRegistration([receipt], moved), receipt);
  assert.equal(findPaymentForRegistration([receipt], registration), null);
  assert.equal(findPaymentForRegistration([receipt], { ...moved, id: 'other-slot', email: cover.email }), null);
  assert.equal(getRegistrationEntryFeePaid(receipt, moved, 550), 400);
  assert.deepEqual(resolveRefundableItems(moved, [receipt], []).map(item => [item.reference, item.refund_amount_rands]), [[before.reference, 400]]);
  assert.deepEqual(receipt.metadata.covers, [cover]);
});

test('the Admin move calls the atomic roster action before touching any participant or sending email', async () => {
  const calls = [];
  const options = { event, registrations:[registration], payments:[before], divisions:[source,target],
    moveTarget:registration, playersToMove:[registration], targetDiv:target,
    sendEmail:async(to, name)=>calls.push(['email',to,name]), logEventActivity:async()=>calls.push(['activity']) };
  const rpc = (name, args) => { calls.push([name, args]); return { error:null }; };
  const supabase = { rpc, from() { throw new Error('A verified receipt does not need a metadata rewrite'); } };
  await moveEventEntries({ ...options, supabase });
  assert.deepEqual(calls[0], ['admin_reviewed_move_registration_division', {
    p_event_id:event.id, p_target_division_id:target.id, p_source_fee:400, p_target_fee:400,
    p_entries:[{ id:registration.id, email:registration.email, partner_email:'', division:source.name,
      division_id:source.id, status:'registered', payment_status:'paid' }],
  }]);
  assert.deepEqual(calls.map(call=>call[0]), ['admin_reviewed_move_registration_division','reassign_tournament_participant_division','email','activity']);
  calls.length = 0;
  await assert.rejects(moveEventEntries({ ...options, supabase:{ ...supabase, rpc(name,args) {
    calls.push([name,args]); return {error:new Error('Target division is full')};
  } } }), /division is full/);
  assert.deepEqual(calls.map(call=>call[0]), ['admin_reviewed_move_registration_division']);
});

test('the self-service move preserves the quoted receipt after the atomic write', async () => {
  const calls = [];
  await switchRegistrationDivision({
    rpc(name,args) { calls.push([name,args]); return {error:null}; },
    from() { throw new Error('The transaction owns the verified allocation'); },
  }, registration, { id:target.id, name:target.name, fee:target.entry_fee }, [before]);
  assert.deepEqual(calls, [['move_registration_division', {
    p_registration_ids:[registration.id], p_target_division_id:target.id, p_reset_payment:false,
  }]]);
});
