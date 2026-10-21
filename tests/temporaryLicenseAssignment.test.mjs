import test from 'node:test';
import assert from 'node:assert/strict';
import { grantTemporaryLicense } from '../src/utils/temporaryLicenseAssignment.js';

const assignment = { player_id: '3', event_id: '10', source: 'complimentary', reason: '  Event volunteer  ' };
function mockClient(response = { data: { saved: true, id: 'license-id' }, error: null }) {
    const calls = [];
    return {
        calls,
        from() { assert.fail('License assignment must not write tables directly or overwrite Full coverage.'); },
        async rpc(name, args) { calls.push({ name, args }); return response; },
    };
}

test('assigns complimentary event coverage through the audited RPC without inventing payment data', async () => {
    const client = mockClient();
    const result = await grantTemporaryLicense(client, { ...assignment, license_type: 'full', year: 2027, amount: 120, payment_method: 'cash' });
    assert.equal(result.id, 'license-id');
    assert.deepEqual(client.calls, [{ name: 'manage_license', args: { p_action: 'grant', p_input: {
        player_id: 3, event_id: 10, license_type: 'temporary', source: 'complimentary', reason: 'Event volunteer',
    } } }]);
});

for (const method of ['cash', 'eft']) {
    test(`records a manual ${method} payment and coverage in the same RPC`, async () => {
        const client = mockClient();
        await grantTemporaryLicense(client, { ...assignment, source: 'manual', amount: '120.50', payment_method: method, receipt: '  BANK-42  ' });
        assert.deepEqual(client.calls[0].args.p_input, {
            player_id: 3, event_id: 10, license_type: 'temporary', source: 'manual', reason: 'Event volunteer',
            amount: 120.5, payment_method: method, receipt: 'BANK-42',
        });
    });
}

for (const [patch, message] of [
    [{ player_id: null }, /Select a player/],
    [{ event_id: '' }, /Select an event/],
    [{ event_id: '10junk' }, /Select an event/],
    [{ event_id: 1.5 }, /Select an event/],
    [{ reason: '   ' }, /reason/],
    [{ source: 'payment' }, /manual payment or complimentary/],
    [{ source: 'manual', amount: 0, payment_method: 'eft' }, /amount received/],
    [{ source: 'manual', amount: 'invalid', payment_method: 'eft' }, /amount received/],
    [{ source: 'manual', amount: Infinity, payment_method: 'eft' }, /amount received/],
    [{ source: 'manual', amount: 120, payment_method: 'paystack' }, /cash or EFT/],
]) {
    test(`rejects invalid input before requesting issuance: ${JSON.stringify(patch)}`, async () => {
        const client = mockClient();
        await assert.rejects(grantTemporaryLicense(client, { ...assignment, ...patch }), message);
        assert.equal(client.calls.length, 0);
    });
}

for (const message of ['Licenses permission required', 'Event license already exists; restore it if revoked']) {
    test(`surfaces the server rejection without a fallback write: ${message}`, async () => {
        const error = { message };
        const client = mockClient({ data: null, error });
        await assert.rejects(grantTemporaryLicense(client, assignment), e => e === error);
        assert.equal(client.calls.length, 1);
    });
}

test('does not report success for an unconfirmed assignment', async () => {
    for (const data of [null, {}, { saved: false }, { saved: true }]) {
        const client = mockClient({ data, error: null });
        await assert.rejects(grantTemporaryLicense(client, assignment), /not confirmed/);
        assert.equal(client.calls.length, 1);
    }
});
