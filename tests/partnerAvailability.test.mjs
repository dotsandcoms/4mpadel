import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { transformSync } from 'esbuild';

const webSource = readFileSync(new URL('../src/components/ManualEventRegistration.jsx', import.meta.url), 'utf8');
const mobileSource = readFileSync(new URL('../mobile/src/components/events/registration-options.tsx', import.meta.url), 'utf8');
const division = { id: 'open', name: "Men's Open", entry_fee: 600 };
const selfEmail = 'calvin@example.com';
const player = { email: 'chevaan@example.com', name: 'Chevaan' };
const row = (email, extra = {}) => ({ id: email, email, division_id: division.id,
    division: division.name, status: 'registered', payment_status: 'pending', ...extra });
const invitedPair = row(player.email, { full_name: player.name, partner_name: 'Calvin',
    partner_email: selfEmail, payment_status: 'paid', registered_by: 'organiser@example.com' });

for (const [client, source, end] of [
    ['website', webSource, 'const PartnerSearchOption'],
    ['mobile', mobileSource, 'function hasSoloEntry'],
]) {
    // Exercise the actual inline rules used by search and checkout in each client.
    const helpers = source.slice(source.indexOf('const normEmail ='), source.indexOf(end));
    const { code } = transformSync(helpers, { loader: 'ts' });
    const availability = runInNewContext(`${code}\ngetPartnerAvailability;`);
    const check = (rows, viewer = selfEmail) => availability(rows, division.id, player, division.name, viewer);

    test(`${client}: a named partner can complete a one-way pairing without their own entry`, () => {
        assert.equal(check([invitedPair]).ok, true);
        assert.equal(check([{ ...invitedPair, partner_email: ' CALVIN@EXAMPLE.COM ' }], ' Calvin@Example.com ').ok, true);
        assert.equal(check([invitedPair, row(selfEmail)]).ok, true);
    });

    test(`${client}: reciprocal entries remain selectable even when the viewer created the partner entry`, () => {
        const reciprocal = [row(selfEmail, { partner_email: player.email }),
            { ...invitedPair, registered_by: selfEmail }];
        assert.equal(check(reciprocal).ok, true);
        assert.equal(check(reciprocal, 'third@example.com').ok, false);
    });

    test(`${client}: the viewer can complete their own reservation for an unentered or solo partner`, () => {
        const reservation = row(selfEmail, { full_name: 'Calvin', partner_email: player.email });
        assert.equal(check([reservation]).ok, true);
        const solo = row(player.email);
        assert.equal(check([reservation, solo]).ok, true);
        assert.equal(check([reservation, solo]).linkSoloRegId, solo.id);
        assert.equal(check([reservation, solo], 'third@example.com').ok, false);
    });

    test(`${client}: another player cannot take either side of an incomplete team`, () => {
        assert.equal(check([invitedPair], 'third@example.com').ok, false);
        assert.match(check([invitedPair], 'third@example.com').message, /already partnered with Calvin/);
        const reverse = row('third@example.com', { full_name: 'Third', partner_email: player.email });
        assert.equal(check([reverse]).ok, false);
        assert.equal(check([reverse, row(player.email)]).ok, false);
    });

    test(`${client}: a competing incoming reservation blocks an otherwise valid pair`, () => {
        const conflict = row('third@example.com', { full_name: 'Third', partner_email: player.email });
        for (const rows of [[invitedPair, conflict], [conflict, invitedPair]]) {
            assert.equal(check(rows).ok, false);
        }
    });

    test(`${client}: a viewer already linked to a third player cannot join a different team`, () => {
        const outgoing = row(selfEmail, { partner_email: 'third@example.com', partner_name: 'Third' });
        const incoming = row('third@example.com', { full_name: 'Third', partner_email: selfEmail });
        assert.equal(check([invitedPair, outgoing]).ok, false);
        assert.equal(check([invitedPair, incoming]).ok, false);
    });

    test(`${client}: withdrawn and other-division links do not block the reserved partner`, () => {
        const conflict = row('third@example.com', { partner_email: player.email });
        assert.equal(check([invitedPair, { ...conflict, status: 'withdrawn' }]).ok, true);
        assert.equal(check([invitedPair, { ...conflict, division_id: 'mixed' }]).ok, true);
    });

    test(`${client}: solo entries stay linkable and historical booking attribution is not a pairing`, () => {
        const solo = row(player.email, { registered_by: 'organiser@example.com' });
        assert.equal(check([solo]).ok, true);
        assert.equal(check([solo]).isSoloLink, true);
        assert.equal(check([solo]).linkSoloRegId, solo.id);
        assert.equal(check([{ ...solo, partner_name: 'Unknown partner' }]).ok, false);
        assert.equal(check([solo, row('organiser@example.com', { partner_email: player.email })]).ok, false);
    });
}

test('joining a paid partner creates only the missing pending entry and charges only the joining player', () => {
    const source = webSource.slice(webSource.indexOf('    const buildRegistrationRows ='),
        webSource.indexOf('    const buildManualPaymentPayload ='));
    const build = runInNewContext(`${source}\nbuildRegistrationRows;`, {
        profile: { name: 'Calvin' }, userEmail: selfEmail, isWeeklyEvent: false,
        selectedDivisions: [division], selected: { [division.id]: { partnerName: player.name,
            partnerEmail: player.email, payForSelf: true, payForPartner: true } },
        myRegs: [], divisionRegs: [invitedPair], event: { id: 522 }, wizardMode: 'register',
        resolveDivisionEntryFee: d => d.entry_fee, isSelfPayingDivision: () => true,
        isSelfDivisionPaid: () => false, isPartnerDivisionPaid: () => true,
        normEmail: value => (value || '').trim().toLowerCase(), eventPaymentMethod: 'paystack',
        tshirtSize: '', allowTshirtSponsorName: false, allowTshirtLogoUpload: false,
        buyLicenseSelf: false, partnerLicensePurchases: [], accessGrantId: null,
    });
    const { rows, covers, soloLinks } = build();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].email, selfEmail);
    assert.equal(rows[0].partner_email, player.email);
    assert.equal(rows[0].payment_status, 'pending');
    assert.equal(rows[0].partner_payment_status, 'paid');
    assert.equal(covers.length, 1);
    assert.equal(covers[0].email, selfEmail);
    assert.equal(covers[0].type, 'entry');
    assert.equal(soloLinks.length, 0);
    assert.equal(invitedPair.payment_status, 'paid');
});
