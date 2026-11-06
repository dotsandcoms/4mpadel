import test from 'node:test';
import assert from 'node:assert/strict';
import { dedupePairRegistrations } from '../src/utils/drawPairing.js';
import { generateKnockoutDraft } from '../src/utils/nativeDrawGenerator.js';

const pair = {
    id: 'pair', full_name: 'Player A', email: 'a@example.test',
    partner_name: 'Player B', partner_email: 'b@example.test',
    created_at: '2026-11-01T08:00:00Z',
};
const standalone = {
    id: 'standalone', full_name: 'Player B', email: ' B@EXAMPLE.TEST ',
    partner_name: null, partner_email: null, created_at: '2026-11-01T07:00:00Z',
};

test('a partner with a standalone registration appears in the knockout only once', () => {
    const other = { ...pair, id: 'other', full_name: 'Player C', email: 'c@example.test', partner_name: 'Player D', partner_email: 'd@example.test' };
    for (const registrations of [[standalone, pair, other], [pair, other, standalone]]) {
        const teams = dedupePairRegistrations(registrations);
        assert.deepEqual(teams.map(team => team.id), ['pair', 'other']);
        assert.ok(teams.every(team => team.partner_name));
        const draw = generateKnockoutDraft(teams.map(team => ({ ...team, team_name: `${team.full_name} / ${team.partner_name}` })));
        assert.equal(draw.entries.length, 2);
        assert.equal(draw.matches.length, 1);
    }
});

test('reciprocal pairs still prefer the most complete row and then the oldest', () => {
    const reciprocal = { ...standalone, partner_name: 'Player A', partner_email: pair.email };
    assert.deepEqual(dedupePairRegistrations([pair, reciprocal]), [reciprocal]);
    assert.deepEqual(dedupePairRegistrations([reciprocal, { ...pair, partner_name: null }]), [reciprocal]);
});

test('an unrelated solo entrant is retained, even with the same display name', () => {
    const solo = { ...standalone, id: 'unrelated', email: 'another@example.test' };
    assert.deepEqual(dedupePairRegistrations([pair, solo]), [pair, solo]);
});

test('excluding the complete pair leaves its standalone partner available for review', () => {
    assert.deepEqual(dedupePairRegistrations([standalone]), [standalone]);
});

test('individual Americano keeps standalone players in its review list', () => {
    assert.deepEqual(dedupePairRegistrations([pair, standalone], { keepStandalonePlayers: true }), [pair, standalone]);
});

test('incomplete partner details do not hide the standalone registration', () => {
    for (const incomplete of [{ ...pair, partner_name: null }, { ...pair, email: null }, { ...pair, partner_email: null }]) {
        assert.equal(dedupePairRegistrations([incomplete, standalone]).length, 2);
    }
});

test('two complete pair registrations sharing a player remain visible', () => {
    const conflicting = { ...standalone, partner_name: 'Player C', partner_email: 'c@example.test' };
    assert.deepEqual(dedupePairRegistrations([pair, conflicting]), [pair, conflicting]);
});
