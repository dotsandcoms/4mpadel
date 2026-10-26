import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moveEventEntries } from '../../src/utils/moveEventEntries.js';

function setup() {
  const writes = [], emails = [], audits = [];
  const players = [
    { id: 1, full_name: 'One', email: 'one@test', division: 'Open', payment_status: 'paid', partner_email: 'two@test' },
    { id: 2, full_name: 'Two', email: 'two@test', division: 'Open', payment_status: 'paid', partner_email: 'one@test' },
  ];
  const supabase = { from(table) {
    let value;
    const query = { update(v) { value = v; writes.push({ table, value }); return query; }, select() { return query; }, eq() { return query; }, neq() { return query; }, ilike() { return query; }, then(resolve) { return Promise.resolve({ data: value ? [{ id: 1 }] : [], error: null }).then(resolve); } };
    return query;
  }, rpc: async () => ({ error: null }) };
  return { writes, emails, audits, args: { supabase, event: { id: 10, event_name: 'Event' }, registrations: players, payments: [], divisions: [{ id: 'old', name: 'Open', entry_fee: 500 }], moveTarget: players[0], playersToMove: players, targetDiv: { id: 'new', name: 'Advanced', entry_fee: 600 }, moveTeamTogether: true, sendEmail: async (...args) => emails.push(args), logEventActivity: async row => audits.push(row) } };
}
test('team move preserves pairing, updates higher-fee paid entries to pending, and sends notices', async () => {
  const { args, writes, emails, audits } = setup();
  await moveEventEntries(args);
  const moved = writes.filter(row => row.value.division === 'Advanced');
  assert.equal(moved.length, 2);
  assert.equal(moved[0].value.payment_status, 'pending');
  assert.equal(moved[0].value.partner_email, 'two@test');
  assert.equal(moved[0].value.partner_payment_status, 'pending');
  assert.equal(moved[1].value.partner_email, 'one@test');
  assert.equal(emails.length, 2);
  assert.equal(audits[0].action, 'admin.moved_entries');
});
test('active duplicate blocks the move before any writes', async () => {
  const { args, writes } = setup();
  args.registrations = [...args.registrations, { id: 3, email: 'one@test', division: 'Advanced', status: 'registered' }];
  await assert.rejects(moveEventEntries(args), /already has an active entry/);
  assert.equal(writes.length, 0);
});
test('single-player move clears pairing and lower fee keeps paid state', async () => {
  const { args, writes } = setup();
  args.playersToMove = [args.moveTarget]; args.moveTeamTogether = false; args.targetDiv.entry_fee = 400;
  await moveEventEntries(args);
  const moved = writes.find(row => row.value.division === 'Advanced').value;
  assert.equal(moved.payment_status, 'paid'); assert.equal(moved.partner_email, null);
});
test('moving both players preserves both cover changes on a shared payment', async () => {
  const { args, writes } = setup();
  args.payments = [{ id: 90, status: 'success', metadata: { covers: [
    { type: 'entry', email: 'one@test', division: 'Open' },
    { type: 'entry', email: 'two@test', division: 'Open' },
  ] } }];
  await moveEventEntries(args);
  const updates = writes.filter(row => row.table === 'payments');
  assert.equal(updates.length, 2);
  assert.deepEqual(updates.at(-1).value.metadata.covers.map(row => row.division), ['Advanced', 'Advanced']);
  assert.equal(args.payments[0].metadata.covers[0].division, 'Open');
});
