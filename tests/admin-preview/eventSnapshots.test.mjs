import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventSnapshot, loadEventSnapshots, readEventProfiles } from '../../src/pages/admin-preview/eventSnapshots.js';
import { mockReadClient } from './playersTestData.mjs';

test('manual snapshot matches fee basis, counts comped separately and deduplicates licences', () => {
  const event = { id: 1, is_manual: true };
  const row = { event_id: 1, email: 'one@example.test', tournament_divisions: { entry_fee: 650 }, payment_status: 'paid' };
  const result = eventSnapshot(event, [row, { ...row, division: 'Mixed' }, { ...row, email: 'two@example.test', payment_status: 'pending' }, { ...row, status: 'withdrawn' }], [], [{email:'one@example.test',license_type:'full'},{email:'two@example.test',temporary_licenses:[{event_id:1}]}], []);
  assert.equal(result.entries,3); assert.equal(result.paid,2);
  assert.equal(result.billed,1950); assert.equal(result.collected,1300); assert.equal(result.outstanding,650);
  assert.equal(result.full,1); assert.equal(result.temp,1); assert.equal(result.none,0);
});
test('external events use participant fees and event-specific temporary licences', () => {
  const result = eventSnapshot({id:2,entry_fee:600,category_fees:{Open:650}},[],[{event_id:2,class_name:'Open',is_paid:true,profile_id:'a'},{event_id:2,class_name:'Mixed',is_paid:false,profile_id:'b'}],[{id:'a',license_type:'full'},{id:'b',temporary_licenses:[{event_id:3}]}],[]);
  assert.equal(result.billed,1250); assert.equal(result.collected,650);
  assert.equal(result.full,1); assert.equal(result.none,1);
});
test('complimentary entries are not billed or counted as paid entries', () => {
  const result = eventSnapshot({id:1,is_manual:true},[{id:'r',event_id:1,email:'a@test.local',payment_status:'paid',tournament_divisions:{entry_fee:650}}],[],[],[{status:'success',metadata:{registration_id:'r',comp_entry:true}}]);
  assert.equal(result.entries,1); assert.equal(result.comped,1); assert.equal(result.paid,0); assert.equal(result.billed,0); assert.equal(result.collected,0);
});
test('snapshot loader reads all participant pages and scopes to visible events', async () => {
  const client = mockReadClient({ tournament_participants: Array.from({length:7},(_,i)=>({id:i,event_id:i===6?9:2,is_paid:true,profile_id:12})), players:[{id:12,license_type:'full'}]}, {cap:2});
  client.rpc = async (name, args) => { assert.equal(name, 'event_license_status'); assert.equal(args.p_event_id, 2); return { data: [{ player_id: 12, eligibility: { full: true, temporary: false, year: 2026 } }] }; };
  const result = await loadEventSnapshots(client,[{id:2,entry_fee:600}]);
  assert.equal(result['2'].entries,6); assert.equal(result['2'].collected,3600); assert.equal(result['2'].full,1);
  assert.equal(result['9'],undefined);
});
test('snapshot read failure rejects rather than returning zero totals', async () => {
  await assert.rejects(loadEventSnapshots(mockReadClient({}, {errors:{tournament_participants:'denied'}}),[{id:2}]),/denied/);
});
test('profile reads fail visibly and preserve the requested image field', async () => {
  let fields;
  const client = {from(){const q={select(value){fields=value;return q;},or(){return q;},order(){return q;},range(){return q;},then(resolve){return Promise.resolve({error:new Error('profile denied')}).then(resolve);}};return q;}};
  await assert.rejects(readEventProfiles(client,['PLAYER@example.test']),/profile denied/);
  assert.ok(fields.includes('image_url'));
});
