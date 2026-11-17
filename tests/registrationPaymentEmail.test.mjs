import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { transform } from 'esbuild';
const { code } = await transform(await fs.readFile(new URL('../supabase/functions/send-email/registration-payment.ts', import.meta.url), 'utf8'), { loader: 'ts', format: 'esm' });
const { registrationEmailAllowed } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
function database(entries, failure = false) {
  let calls = 0;
  return { get calls() { return calls; }, from(table) {
    assert.equal(table, 'event_registrations'); calls++;
    const filters = [];
    return { select() { return this; }, eq(key, value) { filters.push(row => row[key] === value); return this; },
      neq(key, value) { filters.push(row => row[key] !== value); return this; },
      in(key, values) { filters.push(row => values.includes(row[key])); return this; },
      then(resolve) { resolve({ data: entries.filter(row => filters.every(filter => filter(row))), error: failure ? new Error('offline') : null }); } };
  } };
}
const row = { event_id: 570, division: 'Open', email: 'player@example.test', partner_email: 'partner@example.test', status: 'registered', payment_status: 'pending' };
for (const template of ['event_registration', 'payment_confirmation', 'partner_entry_paid']) {
  test(`${template}: a started checkout or unpaid record sends no confirmation`, async () => {
    for (const rows of [[], [row], [{ ...row, payment_status: 'processing' }], [{ ...row, payment_status: 'failed' }]]) {
      assert.equal(await registrationEmailAllowed(database(rows), template, { eventId: 570, paid: true }, row.email), false);
    }
  });
  test(`${template}: only the actual confirmed recipient for this event is eligible`, async () => {
    const paid = { ...row, payment_status: 'paid' };
    assert.equal(await registrationEmailAllowed(database([paid]), template, { eventId: 570 }, row.email), true);
    assert.equal(await registrationEmailAllowed(database([paid]), template, { eventId: 571 }, row.email), false);
    assert.equal(await registrationEmailAllowed(database([paid]), template, { eventId: 570 }, [row.email, 'other@example.test']), false);
    assert.equal(await registrationEmailAllowed(database([{ ...paid, status: 'withdrawn' }]), template, { eventId: 570 }, row.email), false);
  });
}
test('partner invitations wait for the booking player’s confirmed payment', async () => {
  assert.equal(await registrationEmailAllowed(database([row]), 'partner_invite', { eventId: 570 }, row.partner_email), false);
  assert.equal(await registrationEmailAllowed(database([{ ...row, payment_status: 'paid' }]), 'partner_invite', { eventId: 570 }, row.partner_email), true);
});
test('omitting the event cannot bypass the confirmation gate', async () => {
  const db = database([]);
  for (const template of ['event_registration', 'partner_invite', 'partner_entry_paid', 'payment_confirmation']) assert.equal(await registrationEmailAllowed(db, template, {}, row.email), false);
  assert.equal(db.calls, 0);
});
test('database errors stop delivery instead of sending an unverified confirmation', async () => {
  await assert.rejects(registrationEmailAllowed(database([], true), 'event_registration', { eventId: 570 }, row.email), /offline/);
});
test('a paid first division cannot authorise confirmation of an unpaid second division', async () => {
  const db = database([{ ...row, payment_status: 'paid' }, { ...row, division: 'Mixed' }]);
  assert.equal(await registrationEmailAllowed(db, 'event_registration', { eventId: 570, division: 'Mixed', paid: true }, row.email), false);
  assert.equal(await registrationEmailAllowed(db, 'event_registration', { eventId: 570, division: 'Open, Mixed', paid: true }, row.email), false);
  assert.equal(await registrationEmailAllowed(db, 'event_registration', { eventId: 570, division: 'Open', paid: true }, row.email), true);
});
