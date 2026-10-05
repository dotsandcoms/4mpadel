import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildRegistrationTeamsByDivision,
    registrationDivisionKey,
    registrationMatchesDivision,
    registrationsShareDivision,
    resolveRegistrationDivision,
} from '../src/utils/registrationDivision.js';

const ladies35 = { id: 'ladies-35', name: 'Ladies 35yrs - 49yrs', entry_fee: 600 };
const ladies50 = { id: 'ladies-50', name: 'Ladies 50+', entry_fee: 600 };
const divisions = [ladies35, ladies50];
const entry = (id, name, email, partner, divisionId = ladies35.id, division = 'Ladies 35+') => ({
    id, full_name: name, email, partner_email: partner,
    division_id: divisionId, division, status: 'registered', payment_status: 'paid',
});

test('Nationals age-group entries survive a division rename: one pair and one solo', () => {
    const registrations = [
        entry('michelle', 'Michelle', 'michelle@example.com', 'jackie@example.com'),
        entry('jackie', 'Jackie', 'jackie@example.com', 'michelle@example.com'),
        entry('tammy', 'Tammy', 'tammy@example.com', null),
    ];
    const original = structuredClone(registrations);
    const teams = buildRegistrationTeamsByDivision(registrations, divisions)[ladies35.name];
    assert.deepEqual(teams.map((team) => team.players.map((player) => player.id)), [
        ['michelle', 'jackie'], ['tammy'],
    ]);
    assert.equal(registrations.filter((row) => registrationMatchesDivision(row, ladies35, divisions)).length, 3);
    assert.equal(resolveRegistrationDivision(registrations[0], divisions).entry_fee, 600);
    assert.deepEqual(registrations, original, 'Keep saved labels and payment data intact');
});

test('pairs teammates with different saved names for the same Ladies 50+ division', () => {
    const oldEntry = entry('old', 'Old', 'old@example.com', 'new@example.com', ladies50.id, 'Ladies 55+');
    const newEntry = entry('new', 'New', 'new@example.com', 'old@example.com', ladies50.id, ladies50.name);
    const teams = buildRegistrationTeamsByDivision([oldEntry, newEntry], divisions)[ladies50.name];
    assert.equal(teams.length, 1);
    assert.equal(teams[0].players.length, 2);
    assert.ok(registrationsShareDivision(oldEntry, newEntry, divisions));
    assert.equal(registrationDivisionKey(oldEntry, divisions), registrationDivisionKey(newEntry, divisions));
});

test('a linked division takes precedence over a conflicting saved name', () => {
    const registration = entry('r', 'R', 'r@example.com', null, ladies35.id, ladies50.name);
    assert.ok(registrationMatchesDivision(registration, { ...ladies35 }, divisions));
    assert.equal(registrationMatchesDivision(registration, ladies50, divisions), false);
});

test('legacy entries without a link still resolve by a trimmed case-insensitive name', () => {
    const legacy = entry('r', 'R', 'r@example.com', null, null, '  LADIES 50+  ');
    assert.equal(resolveRegistrationDivision(legacy, divisions), ladies50);
    assert.ok(registrationsShareDivision(legacy, entry('s', 'S', 's@example.com', null, ladies50.id), divisions));
});

test('unknown or removed divisions do not get assigned to an unrelated age group', () => {
    const orphan = entry('r', 'R', 'r@example.com', null, null, 'Ladies 45+');
    assert.equal(resolveRegistrationDivision(orphan, divisions), null);
    assert.equal(registrationMatchesDivision(orphan, ladies35, divisions), false);
    assert.equal(registrationsShareDivision(orphan, { division: ladies35.name }, divisions), false);
    assert.equal(registrationsShareDivision({}, {}, divisions), false);
});

test('withdrawn teammates are excluded and player ordering is preserved', () => {
    const a = entry('a', 'A', 'a@example.com', 'b@example.com');
    const b = entry('b', 'B', 'b@example.com', 'a@example.com');
    const withdrawn = { ...entry('withdrawn', 'Withdrawn', 'w@example.com', null), status: 'withdrawn' };
    const teams = buildRegistrationTeamsByDivision([a, b, withdrawn], divisions, (players) => [...players].reverse())[ladies35.name];
    assert.deepEqual(teams.map((team) => team.players.map((player) => player.id)), [['b', 'a']]);
    assert.equal(teams[0].id, 'team_b');
});
