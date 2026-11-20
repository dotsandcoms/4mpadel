import assert from 'node:assert/strict';
import test from 'node:test';
import { entryBalance } from '../mobile/supabase/functions/native-entry-balance/balance.ts';
import { pendingBadgeCount } from '../mobile/supabase/functions/_shared/app-badge.ts';

const event = { id: 61, entry_fee: 425, start_date: '2035-03-01' };
const division = { id: 'open', event_id: event.id, name: 'Open', entry_fee: 425 };
const former = { id: 'new-former-slot', email: 'former@example.invalid', event_id: event.id, division: division.name,
  division_id: division.id, payment_status: 'pending' };
const replacement = { ...former, id: 'transferred-slot', email: 'replacement@example.invalid', payment_status: 'paid' };
const teammate = { ...replacement, id: 'teammate-slot', email: 'teammate@example.invalid' };
const transfer = { cover_position: 2, registration_id: replacement.id, event_id: event.id,
  division_id: division.id, division: division.name, email: replacement.email };
const payment = { status: 'success', event_id: event.id, amount: 920, metadata: {
  source: 'manual_event', registrant_email: former.email,
  covers: [
    { type: 'entry', email: teammate.email, division: division.name, division_id: division.id },
    { type: 'license', license: 'temporary', email: former.email },
    { type: 'entry', email: former.email, division: division.name, registration_id: replacement.id, division_id: division.id },
  ],
  division_entry_fees: { Open: 400 }, verified_entry_transfers: [transfer],
} };

test('the installed app gets the original fee allocation for the exact transferred slot', () => {
  const original = structuredClone(payment);
  assert.deepEqual(entryBalance(event, division, replacement, [payment]), {
    registrationId: replacement.id, division: division.name, known: true, paid: 400, price: 425, due: 25,
  });
  assert.equal(entryBalance(event, division, teammate, [payment]).paid, 400);
  assert.equal(entryBalance(event, division, former, [payment]).due, 425);
  assert.equal(entryBalance(event, division, { ...replacement, id: 'different-slot' }, [payment]).known, false);
  assert.equal(entryBalance(event, division, { ...replacement, event_id: 62 }, [payment]).known, false);
  assert.equal(entryBalance(event, division, { ...replacement, division_id: 'advanced' }, [payment]).known, false);
  assert.equal(entryBalance(event, division, { ...replacement, email: former.email }, [payment]).known, false);
  assert.deepEqual(payment, original);
});

test('a moved slot keeps the original recorded credit under the attested current division', () => {
  const target = { id: 'advanced', name: 'Advanced', entry_fee: 550 };
  const moved = { ...replacement, division_id: target.id, division: target.name };
  const movedPayment = { ...payment, metadata: { ...payment.metadata, division_entry_fees: { Open: 400, Advanced: 550 },
    verified_entry_transfers: [{ ...transfer, division_id: target.id, division: target.name }] } };
  assert.equal(entryBalance(event, target, moved, [movedPayment]).paid, 400);
  assert.equal(entryBalance(event, target, moved, [movedPayment]).due, 150);
  assert.equal(entryBalance(event, division, replacement, [movedPayment]).known, false);
  const legacy = { ...movedPayment, metadata: { ...movedPayment.metadata,
    verified_entry_transfers: [{ ...transfer, division_id: null, division: target.name }] } };
  assert.equal(entryBalance(event, target, { ...moved, division_id: null }, [legacy]).paid, 400);
  assert.equal(entryBalance(event, target, { ...moved, division_id: null, division: 'Other' }, [legacy]).known, false);
});

test('privacy-redacted receipts still prove the original allocation for only the exact current slot', () => {
  const { email: contact, ...redacted } = transfer;
  const receipt = { ...payment, metadata: { ...payment.metadata, verified_entry_transfers:[redacted] } };
  assert.equal(contact, replacement.email);
  assert.equal(entryBalance(event, division, replacement, [receipt]).paid, 400);
  assert.equal(entryBalance(event, division, former, [receipt]).paid, 0);
  assert.equal(entryBalance(event, division, { ...replacement, id: 'another-slot' }, [receipt]).known, false);
  const malformed = { ...payment, metadata: { ...payment.metadata,
    verified_entry_transfers:[{ ...transfer, cover_position:'2' }] } };
  assert.equal(entryBalance(event, division, former, [malformed]).paid, 0);
});

test('native balance and badges retain verified adjustments and exclude unrelated or test payments', () => {
  const adjustment = { status: 'success', event_id: event.id, amount: 25, metadata: {
    source: 'native_entry_balance', registration_id: replacement.id, division: division.name, verified_balance: true,
  } };
  const discarded = [{ ...adjustment, event_id: 62 }, { ...adjustment, is_test: true }, { ...adjustment, status: 'processing' },
    { ...adjustment, metadata: { ...adjustment.metadata, verified_balance: false } }, { ...payment, metadata: 'unreadable' }];
  assert.equal(entryBalance(event, division, replacement, [payment, ...discarded]).due, 25);
  assert.equal(entryBalance(event, division, replacement, [payment, adjustment, ...discarded]).due, 0);
  const player = { email: replacement.email, region: 'Gauteng', racket_brand: 'Fixture' };
  const now = new Date('2035-02-10T00:00:00Z');
  assert.equal(pendingBadgeCount(player, [replacement], [event], [division], [payment], now), 1);
  assert.equal(pendingBadgeCount(player, [replacement], [event], [division], [payment, adjustment], now), 0);
});

test('normal paid receipts, serialized legacy metadata, and expired early bird retain their prior behavior', () => {
  const earlyBird = { ...event, early_bird_ends_at: '2000-01-01T00:00:00Z', early_bird_fee: 400 };
  const normal = { ...payment, metadata: JSON.stringify({ covers: [payment.metadata.covers[0]], division_entry_fees: { Open: 400 } }) };
  assert.equal(entryBalance(earlyBird, division, teammate, [normal]).due, 0);
  assert.equal(entryBalance(earlyBird, division, replacement, [payment]).due, 0);
  assert.equal(entryBalance(event, division, teammate, [{ ...normal, is_test: true }]).known, false);
});
