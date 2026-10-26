import test from 'node:test';
import assert from 'node:assert/strict';
import { playerCreationPayload, createPlayerAccountProfile, verifyPlayerAccountAccess, sendPlayerLoginInvitation, withPlayerActionDeadline, HELD_PLAYER_ACTIONS } from '../../src/pages/admin-preview/playerAccountActions.js';
import { createPlayerProfileDraft, profilePatch } from '../../src/pages/admin-preview/playerProfileEdit.js';
const player = { id: 2, name: 'Synthetic Player', email: 'player@example.invalid' };
const context = () => ({ userId: 'actor', scopeId: 'all', isCurrent: () => true });
function mock({ allowed = true, active = true, uid = 'actor', email = 'admin_%@example.invalid', fresh = player, receipt = {}, insertReceipt, onAuth = () => {} } = {}) {
  const writes = [], sends = [], calls = [];
  return { writes, sends, calls, auth: { getUser: async () => { onAuth(); return { data: { user: { id: uid, email } } }; }, signInWithOtp: async value => { sends.push(value); return receipt; } }, rpc: async (name, args) => { calls.push([name,args]); return { data: name === 'account_is_active' ? active : allowed }; }, from(table) {
    assert.equal(table, 'players'); let inserted = false;
    const query = { select: () => query, eq: () => query, insert: value => { writes.push(value); inserted = true; return query; }, single: async () => ({ data: inserted ? (insertReceipt === undefined ? {id:3,...writes[0][0]} : insertReceipt) : fresh }) }; return query;
  } };
}
test('source creation is profile-only and excludes licence/auth projections', async () => {
  const draft = { ...createPlayerProfileDraft({}), name: player.name, email: player.email, license_type: 'full', paid_registration: true, account_type: 'admin', sponsors: 'A, B', points: '12' };
  const payload = playerCreationPayload(draft);
  assert.equal(payload.points, 12); assert.equal(payload.sponsors, '["A","B"]'); assert.equal(payload.approved, true); assert.equal(payload.club_id, null);
  for (const key of ['license_type', 'paid_registration', 'account_type']) assert.equal(key in payload, false);
  const client = mock(); await createPlayerAccountProfile(client, draft, [], context()); assert.equal(client.writes.length, 1); assert.equal(client.sends.length, 0);
});
test('fresh super-admin/all/identity are required; context invalidation prevents writes', async () => {
  for (const [client, ctx] of [[mock({allowed:false}),context()], [mock({active:false}),context()], [mock({uid:'changed'}),context()], [mock(),{...context(),scopeId:'club:1'}]]) await assert.rejects(verifyPlayerAccountAccess(client,ctx));
  let active = true; const client = mock({ onAuth: () => { active = false; } });
  await assert.rejects(createPlayerAccountProfile(client, { name:'Synthetic' }, [], {...context(),isCurrent:()=>active}), /context changed/); assert.equal(client.writes.length,0);
});
test('unconfirmed creation cannot report success', async () => {
  await assert.rejects(createPlayerAccountProfile(mock({insertReceipt:null}), {name:'Synthetic'}, [], context()), /avoid a duplicate/);
  await assert.rejects(createPlayerAccountProfile(mock({insertReceipt:{id:3,name:'Wrong'}}), {name:'Synthetic'}, [], context()), /avoid a duplicate/);
});
test('timed-out preflight cannot send a late invitation', async () => {
  let release; const client=mock(); const original=client.auth.getUser; client.auth.getUser=()=>new Promise(resolve=>{release=()=>original().then(resolve);});
  await assert.rejects(withPlayerActionDeadline(ctx=>sendPlayerLoginInvitation(client,player,'https://example.invalid',ctx),context(),5),/timed out/);
  release(); await new Promise(resolve=>setTimeout(resolve,0)); assert.equal(client.sends.length,0);
});
test('recipient id must match the reviewed record', async () => {
  const client=mock({fresh:{...player,id:9}}); await assert.rejects(sendPlayerLoginInvitation(client,player,'https://example.invalid',context()),/recipient changed/); assert.equal(client.sends.length,0);
});
test('invitation follows source OTP contract with fresh recipient and no password', async () => {
  const client = mock(); await sendPlayerLoginInvitation(client, player, 'https://example.invalid/path', context());
  assert.deepEqual(client.sends,[{email:player.email,options:{emailRedirectTo:'https://example.invalid/profile?new_invite=true'}}]); assert.equal(client.writes.length,0); assert.equal(client.calls.length,4);
  assert.deepEqual(client.calls[1], ['is_super_admin', {user_email:'admin_%@example.invalid'}]);
});
test('recipient mismatch, invalid email and HTTP200 error never report invite success', async () => {
  const client=mock({fresh:{...player,email:'changed@example.invalid'}}); await assert.rejects(sendPlayerLoginInvitation(client,player,'https://example.invalid',context()), /recipient changed/); assert.equal(client.sends.length,0);
  await assert.rejects(sendPlayerLoginInvitation(mock({receipt:{data:{error:'provider failed'}}}),player,'https://example.invalid',context()),/could not be confirmed/);
});
test('playing preferences use source values and null clearing without licence flags', () => {
  assert.deepEqual(profilePatch({name:'Synthetic',playing_hand:'right'},{name:'Synthetic',playing_hand:'',court_side:'either'}),{playing_hand:null,court_side:'either'});
  assert.throws(()=>profilePatch({name:'Synthetic'},{name:'Synthetic',playing_hand:'both'}),/supported/);
  assert.match(HELD_PLAYER_ACTIONS['Test login'],/held/); assert.match(HELD_PLAYER_ACTIONS['Delete player'],/held/); assert.match(HELD_PLAYER_ACTIONS['Reset password'],/No password/);
});
