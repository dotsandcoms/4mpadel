import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eligibleEventPartners, pairEventEntries, inviteEventPartner } from '../../src/utils/pairEventEntries.js';

function fixture() {
  const solo = { id: 1, event_id: 9, division: 'Open', full_name: 'A', email: 'a@test', payment_status: 'pending', status: 'registered' };
  const partner = { ...solo, id: 2, full_name: 'B', email: 'b@test', payment_status: 'paid' };
  const writes = [], emails = [];
  const client = { from() { return {
    update(values) { const write = { values, filters: {} }; writes.push(write); const chain = { eq(key, value) { write.filters[key] = value; return chain; }, async select() { return { data: [{ id: write.filters.id }] }; } }; return chain; },
    insert(values) { writes.push({ values, insert: true }); return { select() { return { async maybeSingle() { return { data: { id: 3, pay_token: 'token' } }; } }; } }; },
  }; } };
  return { writes, emails, args: { client, event: { id: 9, event_name: 'Event', slug: 'event' }, solo, partner, registrations: [solo, partner], sendEmail: async (...args) => { emails.push(args); return { success: true }; } } };
}

test('pairing preserves unpaid solo eligibility and mirrors both actual payment states', async () => {
  const f = fixture();
  assert.deepEqual(eligibleEventPartners(f.args.solo, f.args.registrations).map(row => row.id), [2]);
  await pairEventEntries(f.args);
  assert.equal(f.writes[0].values.partner_payment_status, 'paid');
  assert.equal(f.writes[1].values.partner_payment_status, 'pending');
  assert(f.writes.every(write => write.values.payment_status === undefined && write.filters.event_id === 9));
  assert.equal(f.emails.length, 2);
  assert(f.emails.every(([, template]) => template === 'partner_assigned'));
});

test('paired, withdrawn, cross-division, self-email and reverse-linked entries are ineligible', async () => {
  for (const patch of [{ partner_name: 'Other' }, { status: 'withdrawn' }, { division: 'Mixed' }, { email: 'A@test' }, { event_id: 10 }]) {
    const f = fixture(); Object.assign(f.args.partner, patch);
    await assert.rejects(pairEventEntries(f.args)); assert.equal(f.writes.length, 0);
  }
  const f = fixture(); f.args.registrations.push({ ...f.args.partner, id: 4, email: 'c@test', partner_email: 'b@test' });
  await assert.rejects(pairEventEntries(f.args)); assert.equal(f.writes.length, 0);
});

test('email failure reports warning without claiming pairing failed', async () => {
  const f = fixture(); f.args.sendEmail = async () => ({ success: false });
  assert.equal((await pairEventEntries(f.args)).warnings.length, 2);
  assert.equal(f.writes.length, 2);
});

test('invite uses pending registration, actual inviter payment state and legacy pay-token template', async () => {
  const f = fixture();
  await inviteEventPartner({ ...f.args, profile: { id: 5, name: 'C', email: 'c@test' }, division: { id: 6, event_id: 9, name: 'Open', entry_fee: 600 } });
  assert.equal(f.writes[0].values.payment_status, 'pending');
  assert.equal(f.writes[0].values.partner_payment_status, 'pending');
  assert.equal(f.writes[0].values.registered_by, 'a@test');
  assert.equal(f.writes[1].values.partner_email, 'c@test');
  assert.equal(f.emails[0][1], 'partner_invite');
  assert.equal(f.emails[0][2].payUrl, 'https://4mpadel.co.za/calendar/event?pay_token=token');
});

test('invite rejects existing active player and reverse-linked player before writing', async () => {
  for (const profile of [{ name: 'B', email: 'B@test' }, { name: 'A', email: 'a@test' }]) {
    const f = fixture();
    await assert.rejects(inviteEventPartner({ ...f.args, profile, division: { event_id: 9, name: 'Open' } }));
    assert.equal(f.writes.length, 0);
  }
});

test('failed row updates do not send notifications', async () => {
  const f = fixture();
  f.args.client = { from() { const chain = { update() { return chain; }, eq() { return chain; }, async select() { return { error: new Error('Denied') }; } }; return chain; } };
  await assert.rejects(pairEventEntries(f.args)); assert.equal(f.emails.length, 0);
});
