import assert from 'node:assert/strict';
import test from 'node:test';
import { createBackfillHandler, verifiedBackfillCharge } from '../supabase/functions/admin-paystack-backfill/handler.mjs';
import { canReviewGatewayBackfill } from '../src/pages/admin-preview/paystackBackfill.js';

const actor = '00000000-0000-0000-0000-000000000002';
const reference = 'EVREG-FIXTURE-2026';
const txn = { id:54321, reference, status:'success', domain:'live', currency:'ZAR', amount:52500,
    paid_at:'2026-11-17T11:00:00Z', customer:{email:'Player@example.invalid'},
    metadata:{source:'manual_event', event_id:17, covers:[{
        type:'entry',email:'Player@example.invalid',division:'Open',registration_id:'00000000-0000-0000-0000-000000000003',
    }]},
};
const now = () => Date.parse('2026-11-19T12:00:00Z');
function mock({ authorized = true, transaction = () => txn, matches = () => 'entry', hasRefunds = async () => false } = {}) {
    const calls = [];
    let stored = false;
    const handler = createBackfillHandler({
        now, hasRefunds,
        authorize:async token => authorized && token==='fixture' ? {id:actor}:null,
        verify:async reference => { calls.push(['gateway',reference]); return transaction(); },
        recover:async (who, charge, plan, reason) => {
            calls.push([plan ? 'record':'plan',who,charge,reason]);
            if (stored) return {state:'already_recorded'};
            if (plan) { stored=true; return {state:'recorded',kind:plan.kind}; }
            return {state:'review',plan:{kind:matches(),reference:charge.gateway_reference,amount_minor:charge.amount_minor,
                payer_email:charge.payer_email,paid_at:charge.paid_at,event_id:17,registration_ids:['fixture'],
                private_registration_details:'not the response'}};
        },
    });
    async function request(body, token = 'fixture') {
        const response = await handler(new Request('https://test.invalid', {
            method:'POST', headers:{'Content-Type':'application/json', ...(token ? {Authorization:`Bearer ${token}`}:{})},
            body:JSON.stringify({ scopeId:'all', reference, ...body }),
        }));
        return { status:response.status, result:await response.json() };
    }
    return {request,calls};
}

test('platform reviews live ZAR gateway proof then records exactly the reviewed version once',async()=>{
    const {request,calls}=mock();
    const preview=await request({action:'review'});
    assert.equal(preview.status,200);
    assert.equal(preview.result.state,'review');
    assert.equal(preview.result.payer,'player@example.invalid');
    assert.equal(preview.result.kind,'entry');
    assert.equal(preview.result.entries,1);
    assert.equal('private_registration_details' in preview.result,false);
    assert.deepEqual(calls.map(([name])=>name),['gateway','plan']);
    const input={action:'record',reason:'Recorded after verifying fixture receipt',token:preview.result.token};
    assert.equal((await request(input)).result.state,'recorded');
    assert.equal((await request(input)).result.state,'already_recorded');
    assert.equal(calls.filter(([name])=>name==='record').length,1);
    const [, who, charge, reason]=calls.find(([name])=>name==='record');
    assert.equal(who,actor);
    assert.equal(charge.covers[0].registration_id,'00000000-0000-0000-0000-000000000003');
    assert.equal(reason,input.reason);
});
test('a different verified amount or database outcome invalidates a previously reviewed receipt',async()=>{
    let amount=52500,kind='entry';
    const {request,calls}=mock({transaction:()=>({...txn,amount}),matches:()=>kind});
    const preview=await request({action:'review'});
    const record={action:'record',token:preview.result.token,reason:'fixture review'};
    amount=52600;
    assert.equal((await request(record)).status,409);
    amount=52500;kind='unallocated';
    assert.equal((await request(record)).status,409);
    assert.equal(calls.filter(([name])=>name==='record').length,0);
});
test('tenant, inactive or unauthenticated callers cannot reach gateway verification',async()=>{
    const denied=mock({authorized:false});
    assert.equal((await denied.request({action:'review'})).status,403);
    const platform=mock();
    assert.equal((await platform.request({action:'review',scopeId:'org:foreign'})).status,400);
    assert.equal((await platform.request({action:'review',reference:'path/escape'})).status,400);
    assert.equal((await platform.request({action:'review'},null)).status,401);
    assert.deepEqual([...platform.calls,...denied.calls],[]);
});
test('an unavailable, unsuccessful, different, test-mode or wrong-currency receipt cannot produce a plan',async()=>{
    const bad=[
        [null,404],[{...txn,status:'failed'},422],[{...txn,domain:'test'},422],[{...txn,currency:'USD'},422],
        [{...txn,reference:'foreign'},422],[{...txn,amount:-1},422],[{...txn,id:Number.MAX_SAFE_INTEGER+2},422],
        [{...txn,metadata:{...txn.metadata,is_test:true}},422],
    ];
    for(const [transaction,status] of bad) {
        const {request,calls}=mock({transaction:()=>transaction});
        assert.equal((await request({action:'review'})).status,status);
        assert.deepEqual(calls,[['gateway',reference]]);
    }
});
test('unknown price-only metadata and cross-event covers are never treated as verified entry or licence allocations',()=>{
    const current=verifiedBackfillCharge(reference,{...txn,metadata:{license_type:'full',event_id:17}},now());
    assert.equal(current.source,null);
    assert.equal(current.covers,null);
    const foreign=verifiedBackfillCharge(reference,{...txn,metadata:{...txn.metadata,covers:[{...txn.metadata.covers[0],event_id:91}]}},now());
    assert.equal(foreign.event_id,null);
    assert.equal(foreign.covers,null);
    const known=verifiedBackfillCharge(reference,{...txn,metadata:JSON.stringify({...txn.metadata,secret:'private',covers:[{...txn.metadata.covers[0],amount:5}]})},now());
    assert.equal(known.event_id,'17');
    assert.equal('amount' in known.covers[0],false);
    assert.equal('secret' in known,false);
});
test('platform recovery offers missing and audited unallocated successful live receipts',()=>{
    const session={user:{id:actor}}, admin={role:'super_admin'};
    const row={reference,environment:'live',status:'success',link:{state:'unmatched'}};
    assert.equal(canReviewGatewayBackfill(session,admin,'all',row),true);
    for(const status of ['ambiguous','unavailable','matched']){
        assert.equal(canReviewGatewayBackfill(session,admin,'all',{...row,link:{state:status}}),false);
    }
    const unallocated = {...row,link:{state:'matched',unallocated:true}};
    assert.equal(canReviewGatewayBackfill(session,admin,'all',unallocated),true);
    assert.equal(canReviewGatewayBackfill(session,{role:'org_admin'},'all',unallocated),false);
    assert.equal(canReviewGatewayBackfill(session,admin,'org:foreign',unallocated),false);
    assert.equal(canReviewGatewayBackfill(session,admin,'all',{...unallocated,status:'failed'}),false);
    assert.equal(canReviewGatewayBackfill(session,admin,'all',{...row,environment:'test'}),false);
    assert.equal(canReviewGatewayBackfill(session,admin,'org:foreign',row),false);
    assert.equal(canReviewGatewayBackfill(session,{role:'admin'},'all',row),false);
});

test('pending, processed or unavailable gateway refund evidence prevents a recovery plan',async()=>{
    const {request,calls}=mock({hasRefunds:async id=>{assert.equal(id,'54321');return true;}});
    const result=await request({action:'review'});
    assert.equal(result.result.state,'held');
    assert.match(result.result.message,/refund/);
    assert.deepEqual(calls,[['gateway',reference]]);
    const offline=mock({hasRefunds:async()=>{throw new Error('fixture outage');}});
    assert.equal((await offline.request({action:'review'})).status,503);
    assert.deepEqual(offline.calls,[['gateway',reference]]);
});
