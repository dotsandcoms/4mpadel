import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGatewayLinks } from '../src/pages/admin-preview/gatewayLinks.js';
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

test('legacy and named native references use only exact saved live event checkouts', async () => {
    const { client, calls } = mock();
    const refs = ['MOBILE-ROCKETS-CUP-17949878596810000000000', 'MOBILE-aabbccdd-10ca1e57-2c22-43a8-b6c8-b53f050d62ca',
        'MOBILE-LICENCE', 'MOBILE-ORPHAN', 'MOBILE-ENTRY-BALANCE', 'MOBILE-NO-EVENT'];
    const saved = { payment_method:'paystack', payment_type:'event_entry_fee', event_id:14,
        checkout_source:'manual_event', amount:600, currency:'ZAR', status:'success', is_test:false };
    client.from = table => {
        assert.equal(table, 'payments');
        let offset;
        return {
            select(fields) { assert.ok(fields.includes('checkout_source:metadata->>source')); return this; },
            eq() { return this; }, in() { return this; }, order() { return this; }, abortSignal() { return this; },
            range(start) { offset = start; return this; },
            then(resolve) { return resolve({ data:offset ? [] : [
                { ...saved, id:'legacy', reference:refs[1] },
                { ...saved, id:'named', reference:refs[0] },
                { ...saved, id:'unrelated', payment_type:'license', reference:refs[2] },
                { ...saved, id:'balance', checkout_source:'native_entry_balance', reference:refs[4] },
                { ...saved, id:'no-event', event_id:null, reference:refs[5] },
            ] }); },
        };
    };
    const rows = await loadGatewayLinks(client, session, platform, 'all', refs.map(reference => ({
        reference, environment:'live', status:'success', amountMinor:60000, currency:'ZAR',
    })));
    for (const row of rows.slice(0, 2)) {
        assert.equal((await confirmGatewayCheckout(client,session,platform,'all',row)).status,'done');
    }
    assert.deepEqual(calls.map(([name, args]) => [name,args.p_reference || args.body.reference]), [
        ['event_checkout_state',refs[0]], ['confirm-manual-payment',refs[0]],
        ['event_checkout_state',refs[1]], ['confirm-manual-payment',refs[1]],
    ]);
    for (const row of rows.slice(2)) {
        await assert.rejects(confirmGatewayCheckout(client,session,platform,'all',row),/verified successful/);
    }
    assert.equal(calls.length,4);
});
