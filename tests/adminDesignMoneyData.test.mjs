import test from 'node:test';
import assert from 'node:assert/strict';
import {
    readLicenseRpc, licenseReviewPayload, writeLicenseReview,
} from '../src/pages/admin-preview/licenseData.js';
import {
    canReadPlatformPaystack, confirmGatewayCheckout, loadPlatformGatewayTransactions,
} from '../src/pages/admin-preview/platformPaystack.js';

const session = { user: { id:'user-1' } };
const platform = { role:'super_admin' };
const event = {
    reference:'EVREG-FIXTURE-12', environment:'live', status:'success',
    link:{ state:'matched' },
};

function mock(allowed = true) {
    const calls = [];
    const client = {
        auth: { async getUser() { return { data: { user: { id:'user-1' } } }; } },
        async rpc(name, args) {
            calls.push([name, args]);
            if (name === 'can_manage_licenses') return { data:allowed };
            if (name === 'event_checkout_state') return { data:allowed ? { state:'awaiting_payment' } : {} };
            return { data: { saved:true, id:'saved-id' } };
        },
        functions: { async invoke(name, options) {
            calls.push([name, options]);
            if (name.startsWith('paystack-transactions?')) return { data: {
                mode:'live', transactions:[
                    { id:event.reference, is_test:false, user:'fixture@example.invalid', amount:'R 1,234.56', status:'Success', rawDate:'2026-11-03T12:00:00Z' },
                    { id:'test-ref', is_test:true },
                ],
            } };
            return { data:{ processed:true } };
        } },
    };
    return { client, calls };
}

test('licence grants and changes require current verified access and a reason', async () => {
    const value = licenseReviewPayload('grant', {
        reason:' Fixture review ', license_type:'temporary', event_id:14, source:'manual', amount:'120', payment_method:'eft',
    }, 71);
    const allowed = mock();
    await writeLicenseReview(allowed.client, session, 'all', value);
    assert.deepEqual(allowed.calls.map(([name])=>name), ['can_manage_licenses', 'manage_license']);
    assert.deepEqual(allowed.calls[1][1], { p_action:'grant', p_input:{
        player_id:71,event_id:14,license_type:'temporary',source:'manual',reason:'Fixture review',amount:120,payment_method:'eft',receipt:'',
    } });
    const forbidden = mock(false);
    await assert.rejects(writeLicenseReview(forbidden.client,session,'all',value), /permission/);
    await assert.rejects(writeLicenseReview(forbidden.client,session,'org:other',value), /account workspace/);
    assert.deepEqual(forbidden.calls.map(([name])=>name), ['can_manage_licenses']);
    assert.throws(()=>licenseReviewPayload('restore_season',{year:2026,reason:''}), /reason/);
});

test('licence read API preserves report access and requires the confirmation boundary for mutations', async () => {
    const { client, calls } = mock();
    await readLicenseRpc(client,session,'all','license_sales_overview',{p_year:2027});
    await readLicenseRpc(client,session,'all','license_federation_sales_export',{p_from:'2026-11-01'});
    await assert.rejects(readLicenseRpc(client,session,'all','manage_license',{p_action:'archive_season'}), /confirmation/);
    assert.deepEqual(calls.map(([name])=>name), ['can_manage_licenses','license_sales_overview','can_manage_licenses','license_federation_sales_export']);
    for (const action of ['archive_season','restore_season']) {
        const request = licenseReviewPayload(action,{year:'2027',reason:'Fixture'});
        await writeLicenseReview(client,session,'all',request);
        assert.deepEqual(calls.at(-1), ['manage_license', {p_action:action,p_input:{year:2027,reason:'Fixture'}}]);
    }
});

test('Paystack adapter preserves the current endpoint amount and environment without exposing raw metadata', async () => {
    const { client, calls } = mock();
    const rows = await loadPlatformGatewayTransactions(client,session,platform,'all',{mode:'live',from:'2026-11-01'});
    assert.deepEqual(rows,[{reference:event.reference,amountMinor:123456,createdAt:'2026-11-03T12:00:00Z',
        status:'success',currency:'ZAR',environment:'live',channel:'',payerEmail:'fixture@example.invalid'}]);
    assert.match(calls[0][0], /^paystack-transactions\?mode=live&from=2026-10-31T22/);
    assert.equal(canReadPlatformPaystack(session,platform,'org:1'),false);
    await assert.rejects(loadPlatformGatewayTransactions(client,session,{role:'org_owner'},'all',{mode:'live'}),/access/);
    assert.equal(calls.length,1);
});

test('checkout recovery verifies saved scoped references and refuses orphan or test transactions', async () => {
    const { client,calls } = mock();
    assert.equal((await confirmGatewayCheckout(client,session,platform,'all',event)).status,'done');
    assert.deepEqual(calls.map(([name])=>name),['event_checkout_state','confirm-manual-payment']);
    for (const row of [{...event,link:{state:'unmatched'}},{...event,environment:'test'},{...event,status:'failed'}]) {
        await assert.rejects(confirmGatewayCheckout(client,session,platform,'all',row),/verified successful/);
    }
    assert.equal(calls.length,2);
    const denied = mock(false);
    await assert.rejects(confirmGatewayCheckout(denied.client,session,platform,'all',event),/revoked/);
    assert.deepEqual(denied.calls.map(([name])=>name),['event_checkout_state']);
});
