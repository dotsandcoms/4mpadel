import test from 'node:test';
import assert from 'node:assert/strict';
import { eligibleRegistrationTeamPartners, findRegistrationTeammate, manageRegistrationTeam } from '../src/utils/registrationTeams.js';
import { buildRegistrationTeamsByDivision } from '../src/utils/registrationDivision.js';
import { findPaymentForRegistration, registrationCountsAsPaid, resolveRegistrationPayer } from '../src/utils/paymentRegistrationMatch.js';

const divisions = [{ id: 'ladies', name: 'Ladies 35+' }, { id: 'mixed', name: 'Mixed' }];
const entry = (id, extra = {}) => ({ id, event_id: 101, full_name: id, email: `${id}@example.com`,
    division_id: 'ladies', division: 'Old ladies name', status: 'registered', payment_status: 'paid', ...extra });
const amira = entry('amira', { full_name: 'Amira Safieddine' });
const caterina = entry('caterina', { full_name: 'Caterina Frazzitta', partner_name: 'Amira' });

test('Amira can merge with Caterina despite her named, unentered partner', () => {
    const roster = [amira, caterina];
    assert.deepEqual(eligibleRegistrationTeamPartners(amira, roster, divisions), [caterina]);
    assert.deepEqual(eligibleRegistrationTeamPartners(caterina, roster, divisions), [amira]);
    assert.equal(findRegistrationTeammate(caterina, roster, divisions), null);
});

test('candidates include pending entries and unentered partner emails but exclude other divisions, events, withdrawals and self', () => {
    const pending = entry('pending', { payment_status: 'pending', partner_email: 'not-entered@example.com' });
    const roster = [amira, entry('same-email', { email: ' AMIRA@EXAMPLE.COM ' }), pending,
        entry('withdrawn', { status: 'withdrawn' }), entry('mixed', { division_id: 'mixed' }), entry('other-event', { event_id: 102 })];
    assert.deepEqual(eligibleRegistrationTeamPartners(amira, roster, divisions), [pending]);
    assert.deepEqual(eligibleRegistrationTeamPartners(null, roster, divisions), []);
});

test('one-way partner links can be completed from either side but cannot be taken by a third player', () => {
    const first = entry('first', { partner_email: 'second@example.com' });
    const second = entry('second');
    const roster = [amira, first, second];
    assert.equal(findRegistrationTeammate(first, roster, divisions), second);
    assert.equal(findRegistrationTeammate(second, roster, divisions), first);
    assert.deepEqual(eligibleRegistrationTeamPartners(amira, roster, divisions), []);
    assert.deepEqual(eligibleRegistrationTeamPartners(second, roster, divisions), [first]);
    assert.deepEqual(eligibleRegistrationTeamPartners(first, roster, divisions), [second]);
    const paired = [first, { ...second, partner_email: first.email }];
    assert.deepEqual(eligibleRegistrationTeamPartners(paired[0], paired, divisions), []);
    assert.deepEqual(eligibleRegistrationTeamPartners(paired[1], paired, divisions), []);
});

test('Caterina and Amira can complete the partial link in the live incident, in either row order', () => {
    const reserved = { ...caterina, partner_email: `  ${amira.email.toUpperCase()}  `, partner_payment_status: 'paid' };
    for (const roster of [[amira, reserved], [reserved, amira]]) {
        assert.deepEqual(eligibleRegistrationTeamPartners(amira, roster, divisions), [reserved]);
        assert.deepEqual(eligibleRegistrationTeamPartners(reserved, roster, divisions), [amira]);
    }
});

test('ambiguous partial links involving a third entry cannot be completed', () => {
    const reserved = { ...caterina, partner_email: amira.email };
    const third = entry('third', { partner_email: caterina.email });
    assert.deepEqual(eligibleRegistrationTeamPartners(amira, [amira, reserved, third], divisions), []);
    assert.deepEqual(eligibleRegistrationTeamPartners(reserved, [amira, reserved, third], divisions), []);
});

test('division IDs survive renames and legacy rows resolve by current division name', () => {
    const legacy = entry('legacy', { division_id: null, division: ' LADIES 35+ ' });
    assert.deepEqual(eligibleRegistrationTeamPartners(amira, [amira, legacy], divisions, '  LEGACY@ '), [legacy]);
    assert.deepEqual(eligibleRegistrationTeamPartners(amira, [amira, legacy], divisions, 'missing'), []);
});

test('merge displays one team; split displays both solos and retains player data', () => {
    const paired = [{ ...amira, partner_name: caterina.full_name, partner_email: caterina.email },
        { ...caterina, partner_name: amira.full_name, partner_email: amira.email }];
    assert.equal(buildRegistrationTeamsByDivision(paired, divisions)['Ladies 35+'].length, 1);
    const solo = paired.map((row) => ({ ...row, partner_name: null, partner_email: null, partner_payment_status: null }));
    assert.equal(buildRegistrationTeamsByDivision(solo, divisions)['Ladies 35+'].length, 2);
    assert.deepEqual(eligibleRegistrationTeamPartners(solo[0], solo, divisions), [solo[1]]);
});

test('team mutation uses one RPC with a stable division key and propagates failures', async () => {
    const client = { async rpc(name, args) {
        assert.equal(name, 'manage_registration_team');
        assert.deepEqual(args, { p_action: 'merge', p_registration_id: amira.id,
            p_other_registration_id: caterina.id, p_division_key: 'id:ladies' });
        return { data: { ok: true }, error: null };
    } };
    assert.deepEqual(await manageRegistrationTeam(client, 'merge', amira, caterina, divisions), { ok: true });
    const error = new Error('Draw already generated');
    await assert.rejects(manageRegistrationTeam({ rpc: async () => ({ error }) }, 'split', amira, caterina, divisions), error);
});

test('a team paid in one transaction keeps both paid spots and the original payer after splitting', () => {
    const payment = { id: 'team-payment', event_id: 101, status: 'success', payment_type: 'event_entry_fee', amount: 1600,
        metadata: { email: amira.email, registrant_email: amira.email, covers: [amira, caterina].map((r) => ({
            type: 'entry', email: r.email, division: r.division, division_id: r.division_id,
        })) } };
    for (const player of [amira, caterina]) {
        const solo = { ...player, registered_by: amira.email, partner_name: null, partner_email: null, partner_payment_status: null };
        assert.equal(findPaymentForRegistration([payment], solo), payment);
        assert.equal(registrationCountsAsPaid(solo, null, [payment]), true);
        assert.equal(resolveRegistrationPayer(payment, solo).payerEmail, amira.email);
    }
});
