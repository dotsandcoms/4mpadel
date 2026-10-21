import test from 'node:test';
import assert from 'node:assert/strict';
import { countDivisionPlaces, divisionTeamLimit, reserveDivisionPlaces } from '../src/utils/divisionCapacity.js';

const row = (email, partner_email = null, extra = {}) => ({ id: email, email, partner_email, status: 'registered', payment_status: 'pending', ...extra });

test('a pair and a solo each reserve one team place, including unpaid entries', () => {
    assert.equal(countDivisionPlaces([row('a', 'b'), row('b', 'a'), row('c')]), 2);
    assert.equal(countDivisionPlaces([row('a', 'b')]), 1);
    assert.equal(countDivisionPlaces([row('a', 'b'), row('b')]), 1);
    assert.equal(countDivisionPlaces([row('a'), row('b', 'a')]), 1);
});

test('withdrawals reopen places only when no active teammate remains', () => {
    const pair = [row('a', 'b'), row('b', 'a')];
    assert.equal(countDivisionPlaces(pair), 1);
    assert.equal(countDivisionPlaces([{ ...pair[0], status: 'withdrawn' }, pair[1]]), 1);
    assert.equal(countDivisionPlaces(pair.map(r => ({ ...r, status: 'withdrawn' }))), 0);
    assert.equal(countDivisionPlaces([row('a', null, { status: 'withdrawn' })]), 0);
});

test('joining two solos frees a place and splitting a team needs another place', () => {
    assert.equal(countDivisionPlaces([row('a'), row('b')]), 2);
    assert.equal(countDivisionPlaces([row('a', 'b'), row('b', 'a')]), 1);
});

test('duplicate emails, case, whitespace and partner mirrors do not consume extra places', () => {
    assert.equal(countDivisionPlaces([row(' A ', ' B '), row('a', null, { payment_status: 'paid' }), row('b', 'a')]), 1);
    assert.equal(countDivisionPlaces([row('a', 'b'), row('b', 'a'), row('a')]), 1);
});

test('third-party links never collapse three or more people into a single place', () => {
    assert.equal(countDivisionPlaces([row('a', 'b'), row('b', 'a'), row('c', 'a')]), 2);
    assert.equal(countDivisionPlaces([row('a', 'b'), row('b', 'c'), row('c', 'd'), row('d', 'a')]), 2);
});

test('only positive integer limits restrict a division', () => {
    for (const value of [null, undefined, '', 0, -1, 1.5, 'bad']) assert.equal(divisionTeamLimit({ entry_limit: value }), null);
    assert.equal(divisionTeamLimit({ entry_limit: '24' }), 24);
});

test('reservation errors block checkout rather than allowing payment to proceed', async () => {
    const rows = [row('a')];
    const error = { message: 'Open is full (maximum 24 teams).' };
    await assert.rejects(reserveDivisionPlaces({ async rpc(name, args) {
        assert.equal(name, 'reserve_event_registration_places');
        assert.deepEqual(args, { p_rows: rows, p_solo_links: [] });
        return { error };
    } }, rows), e => e === error);
    await reserveDivisionPlaces({ rpc() { assert.fail('No reservation needed'); } }, []);
});
