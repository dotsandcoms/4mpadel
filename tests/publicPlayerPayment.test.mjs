import test from 'node:test';
import assert from 'node:assert/strict';
import { addPublicPlayerPaymentStatuses, publicPlayerPaymentLabel } from '../src/utils/publicPlayerPayment.js';

const division = { Id: 7, Name: "Men's Elite" };
const rows = [
    { id: 'adam', full_name: 'Adam Player', email_hash: 'adam-hash', division_id: 7, payment_status: 'paid' },
    { id: 'jason', full_name: 'Jason Player', email_hash: 'jason-hash', division_id: 7, payment_status: 'pending' },
];
const team = [{ Participant: { Id: 'local_adam', Players: [
    { Name: 'Adam Player', EmailHash: 'adam-hash', RegistrationId: 'adam' },
    { Name: 'Jason Player', EmailHash: 'jason-hash' },
] }, Ranking: 1 }];
const statuses = (result) => result[0].Participant.Players.map((player) => player.PaymentStatus);

test('each partner uses their own payment status', () => {
    assert.deepEqual(statuses(addPublicPlayerPaymentStatuses(team, rows, division)), ['paid', 'pending']);
    assert.deepEqual(statuses(addPublicPlayerPaymentStatuses(team, rows.map((row) => ({ ...row, payment_status: row.payment_status === 'paid' ? 'pending' : 'paid' })), division)), ['pending', 'paid']);
});

test('payment in another division does not confirm this entry', () => {
    const registrations = [...rows, { ...rows[1], id: 'other-entry', division_id: 8, payment_status: 'paid' }];
    assert.deepEqual(statuses(addPublicPlayerPaymentStatuses(team, registrations, division)), ['paid', 'pending']);
});

test('a missing partner registration is pending even when the booker paid', () => {
    assert.deepEqual(statuses(addPublicPlayerPaymentStatuses(team, [rows[0]], division)), ['paid', 'pending']);
});

test('withdrawn records are excluded', () => {
    assert.deepEqual(statuses(addPublicPlayerPaymentStatuses(team, rows.map((row) => ({ ...row, status: 'withdrawn' })), division)), ['pending', 'pending']);
});

test('external participants match unique full names within their division', () => {
    const external = [{ Participant: { Id: 'rankedin-team', FirstPlayer: { Name: ' ADAM PLAYER ' }, SecondPlayer: { Name: 'Jason Player' } } }];
    const result = addPublicPlayerPaymentStatuses(external, rows.map((row) => ({ ...row, division_id: null, division: "Men's Elite" })), division);
    assert.equal(result[0].Participant.FirstPlayer.PaymentStatus, 'paid');
    assert.equal(result[0].Participant.SecondPlayer.PaymentStatus, 'pending');
});

test('external-only players are not assigned an invented payment status', () => {
    const external = [{ Participant: { Id: 'rankedin-team', Players: [{ Name: 'Unknown Player' }] } }];
    assert.deepEqual(statuses(addPublicPlayerPaymentStatuses(external, rows, division)), [null]);
    assert.equal(publicPlayerPaymentLabel(null), null);
});

test('ambiguous names cannot attach someone else’s payment to an external player', () => {
    const external = [{ Participant: { Id: 'rankedin-team', Players: [{ Name: 'Jason Player' }] } }];
    assert.deepEqual(statuses(addPublicPlayerPaymentStatuses(external, [...rows, { ...rows[1], id: 'same-name', email_hash: 'someone-else', payment_status: 'paid' }], division)), [null]);
});

test('a known hash does not fall back to a different player with the same name', () => {
    const registrations = [rows[0], { ...rows[1], email_hash: 'someone-else', payment_status: 'paid' }];
    assert.deepEqual(statuses(addPublicPlayerPaymentStatuses(team, registrations, division)), ['paid', 'pending']);
});

test('weekly entries resolve statuses without division records', () => {
    assert.deepEqual(statuses(addPublicPlayerPaymentStatuses(team, rows.map((row) => ({ ...row, division_id: null })), { Id: 'weekly_entries', Name: 'Entries' }, { isWeekly: true })), ['paid', 'pending']);
});

test('enrichment preserves seeding and does not mutate participants or registrations', () => {
    const original = structuredClone(team);
    const registrations = structuredClone(rows);
    const result = addPublicPlayerPaymentStatuses(team, rows, division);
    assert.equal(result[0].Ranking, 1);
    assert.deepEqual(team, original);
    assert.deepEqual(rows, registrations);
    assert.equal(publicPlayerPaymentLabel('paid'), 'Paid & Confirmed');
    assert.equal(publicPlayerPaymentLabel('pending'), 'Payment Pending');
});
