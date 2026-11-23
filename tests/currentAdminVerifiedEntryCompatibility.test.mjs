import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';
import { directPaidDivisions } from '../src/utils/publicPlayerPayment.js';
import { findFinancePayment } from '../src/utils/eventFinanceReconciliation.js';
import { buildEventReceiptReport } from '../src/utils/eventReceiptReport.js';
import { calculateEventSettlement } from '../src/utils/eventSettlement.js';
import { findPaymentForRegistration, paymentEntryCoversFor } from '../src/utils/paymentRegistrationMatch.js';
import { hasRecordedPaystackEntryTransfer, recordedPaystackReferences } from '../src/utils/paystackClassification.js';

const former = { playerId: 5, email: 'former@example.invalid', name: 'Former Player', matchesName: (a, b) => a.toLowerCase() === b };
const reference = 'REGEV-17-1276';
const original = {
    reference, player_id: former.playerId, metadata: {
        email: former.email, division: 'Open',
        line_items: [{ player: former.name, type: 'entry', division: 'Open' }],
    },
};
const transferred = { ...original, reference: 'local-receipt', metadata: { ...original.metadata, paystack_ref: reference,
    verified_entry_transfers: [{ registration_id: 'same-slot', cover_position: 1, event_id: 17,
        email: 'replacement@example.invalid', division: 'Open' }],
} };

test('public registration paid divisions keep the legacy receipt fallback and ignore the old payer of a transferred slot', () => {
    assert.deepEqual(directPaidDivisions([original], former), ['Open']);
    assert.deepEqual(directPaidDivisions([{ ...original, player_id: null, metadata: { ...original.metadata, email: null } }], former), ['Open']);
    assert.deepEqual(directPaidDivisions([transferred], former), []);
    assert.deepEqual(directPaidDivisions([{ ...transferred, metadata: JSON.stringify(transferred.metadata) }], former), []);
    const newEntry = { ...original, reference: 'REGEV-new-entry', metadata: { division: 'Social' } };
    assert.deepEqual(directPaidDivisions([transferred, newEntry], former), ['Social']);
});

test('legacy Event Finance and receipt workbooks show the paid slot once under its verified replacement', () => {
    const receipt = {
        id:'ledger-receipt', reference, event_id:17, player_id:former.playerId, amount:400,
        status:'success', payment_type:'event_entry_fee', payment_method:'paystack',
        metadata:{...transferred.metadata, source:'manual_event', registrant_email:former.email,
            division_entry_fees:{Open:400}, covers:[{type:'entry',email:former.email,division:'Open',registration_id:'same-slot'}],
            original_trx:{metadata:{covers:[
                {type:'entry',email:former.email,division:'Historical label'},
                {type:'license',email:former.email,license:'temporary'},
            ]}}},
    };
    const replacement = {id:'same-slot',event_id:17,email:'replacement@example.invalid',full_name:'Replacement Player',division:'Open',
        status:'registered',payment_status:'paid'};
    const reenteredFormer = {...replacement,id:'new-slot',email:former.email,full_name:former.name,
        division:'Historical label',payment_status:'pending'};
    assert.equal(findPaymentForRegistration([receipt],reenteredFormer),null);
    assert.deepEqual(paymentEntryCoversFor(receipt.metadata).map(cover => [cover.type,cover.email]),
        [['entry',replacement.email],['license',former.email]]);
    const legacy = {...receipt,metadata:{...receipt.metadata,verified_entry_transfers:[]}};
    assert.equal(findFinancePayment([legacy],reenteredFormer),legacy);
    const input = {event:{id:17,entry_fee:400},registrations:[replacement,reenteredFormer],payments:[receipt]};
    assert.equal(findFinancePayment([receipt],replacement),receipt);
    assert.equal(findFinancePayment([receipt],reenteredFormer),null);
    const settlement = calculateEventSettlement(input);
    assert.equal(settlement.collected4M,400);
    assert.equal(settlement.paid4M,1);
    const report = buildEventReceiptReport({...input,settlement});
    assert.deepEqual(report.receipts.map(row=>[row.reference,row.amount,row.players,row.payerEmail]),
        [[reference,400,replacement.full_name,former.email]]);
});

test('an invalid alias retires its original cover even if the old payer or registration ID is still stored', () => {
    const registration = {id:'same-slot',event_id:17,email:former.email,division:'Open',status:'registered',payment_status:'paid'};
    const metadata = {
        ...transferred.metadata, source:'manual_event', registrant_email:former.email, registration_id:registration.id,
        covers:[{type:'entry',email:former.email,division:'Open',registration_id:registration.id}],
    };
    for (const alias of [
        {cover_position:1, registration_id:registration.id, event_id:17, email:'replacement@example.invalid',division:'Stale division'},
        {cover_position:1, event_id:17, email:'replacement@example.invalid',division:'Open'},
        {cover_position:'1', registration_id:registration.id, event_id:17, email:'replacement@example.invalid',division:'Open'},
    ]) {
        const receipt = {...transferred,status:'success',event_id:17,payment_type:'event_entry_fee',payment_method:'paystack',
            metadata:{...metadata,verified_entry_transfers:[alias]}};
        assert.deepEqual(paymentEntryCoversFor(receipt.metadata),[]);
        assert.equal(findPaymentForRegistration([receipt],registration),null);
        assert.equal(findFinancePayment([receipt],registration),null);
    }
});

test('current Admin checks exact provider reference aliases and stops on a failed receipt read', async () => {
    const calls = [];
    const client = {
        from(table) {
            return {
                select(fields) { calls.push([table, fields]); return this; },
                eq(column, value) { this.column = column; calls.push([column, value]); return this; },
                async not(column, operator, value) {
                    calls.push([column, operator, value]);
                    return { data: this.column === 'metadata->>paystack_ref' ? [transferred] : [] };
                },
            };
        },
    };
    assert.deepEqual(recordedPaystackReferences(transferred), ['local-receipt', reference]);
    assert.equal(await hasRecordedPaystackEntryTransfer(client, reference, transferred), true);
    assert.deepEqual(calls, []);
    assert.equal(await hasRecordedPaystackEntryTransfer(client, reference, original), true);
    assert.deepEqual(calls.filter(([field]) => field.includes('->>')), [
        ['metadata->>paystack_ref', reference], ['metadata->original_trx->>id', reference],
    ]);
    assert.ok(calls.filter(([field]) => field === 'metadata->verified_entry_transfers').length === 2);

    const readError = new Error('Synthetic receipt read failure');
    const denied = { from: () => ({ select: () => ({ eq: () => ({ not: async () => ({ error: readError }) }) }) }) };
    await assert.rejects(hasRecordedPaystackEntryTransfer(denied, reference, original), readError);
});

const mockClient = `
const fixture = window.fixture;
const actor = { email: 'operator@example.invalid' };
const player = { id:5,name:'Former Player',email:'former@example.invalid',paid_registration:true };
const currentReceipt = () => fixture.applied
    ? fixture.transferred
    : { ...fixture.original };
function from(table) {
    let column,value, list=false, alias=false;
    const rows = () => {
        if (table==='players') return [player];
        if (table==='calendar') return [];
        if (table==='payments') {
            const row=currentReceipt();
            if (list) return [row];
            if (alias) fixture.aliasReads.push([column,value]);
            if (column==='reference' && row.reference===value) return [row];
            if (column==='metadata->>paystack_ref' && row.metadata.paystack_ref===value) return [row];
            if (column==='metadata->original_trx->>id' && row.metadata.original_trx?.id===value) return [row];
            return [];
        }
        return [];
    };
    return {
        select(){return this;}, order(){return this;},
        eq(key,input){column=key;value=input;return this;},
        not(){alias=true;return this;},
        range(){list=true;return this;},
        async maybeSingle(){return {data:rows()[0]||null};},
        then(resolve){return Promise.resolve({data:rows()}).then(resolve)},
        upsert(...args){fixture.writes.push([table,'upsert',args]);return this;},
        update(...args){fixture.writes.push([table,'update',args]);return this;},
        insert(...args){fixture.writes.push([table,'insert',args]);return this;},
        delete(...args){fixture.writes.push([table,'delete',args]);return this;},
    };
}
export const supabase={auth:{async getUser(){return {data:{user:actor}};},async getSession(){return {data:{session:{access_token:'fixture'}}};}},from};
window.fetch=async () => ({ok:true, async json(){return {stats:{},transactions:[
    {id:fixture.original.reference,user:player.email,amount:'R 400.00',status:'Success',
        rawDate:'2026-11-20',metadata:{event_id:17}},
]};}});
`;

test('Current Admin replaces a stale Re-Sync with a recorded transfer and makes no database writes', async () => {
    const output = await build({
        stdin: { contents: `
            import React from 'react';
            import { createRoot } from 'react-dom/client';
            import FinanceManager from './src/components/admin/FinanceManager.jsx';
            createRoot(document.getElementById('root')).render(<FinanceManager />);
        `, loader:'jsx', resolveDir:process.cwd() },
        bundle:true, write:false, loader:{'.png':'dataurl'}, format:'iife',
        define:{'import.meta.env.VITE_SUPABASE_URL':'"https://synthetic-test.invalid"','import.meta.env.VITE_SUPABASE_ANON_KEY':'"fake"'},
        plugins:[{name:'synthetic-current-admin',setup(plugin){
            plugin.onResolve({filter:/supabaseClient$/}, args => ({path:args.path,namespace:'client'}));
            plugin.onLoad({filter:/.*/,namespace:'client'}, () => ({contents:mockClient}));
            plugin.onResolve({filter:/useAdminPermissions$/}, args => ({path:args.path,namespace:'permissions'}));
            plugin.onLoad({filter:/.*/,namespace:'permissions'}, () => ({contents:'export const useAdminPermissions=()=>({permissions:{role:"super_admin"},loading:false});'}));
            plugin.onResolve({filter:/useCommerceConfig$/}, args => ({path:args.path,namespace:'commerce'}));
            plugin.onLoad({filter:/.*/,namespace:'commerce'}, () => ({contents:'export const useCommerceConfig=()=>({config:{}});'}));
            plugin.onResolve({filter:/^\.\/(?:EventFinance|FinancialDashboard|FinancialSummaryReport|UserPayments)$/}, args => ({path:args.path,namespace:'tab'}));
            plugin.onLoad({filter:/.*/,namespace:'tab'}, () => ({contents:'export default () => null;'}));
        }}],
    });
    const browser = await puppeteer.launch({headless:true,args:['--no-sandbox']});
    try {
        const page = await browser.newPage();
        await page.setContent('<main id="root"></main>');
        await page.evaluate(payload => { window.fixture=payload }, {original,transferred,applied:false,aliasReads:[],writes:[]});
        await page.addScriptTag({content:output.outputFiles[0].text});
        const click = async label => {
            const target = await page.waitForFunction(text =>
                [...document.querySelectorAll('button')].find(node => !node.disabled && node.textContent.trim()===text),
            {polling:50},label);
            try { await target.evaluate(node=>node.click()); } finally { await target.dispose(); }
        };
        await click('Live Paystack');
        await page.waitForFunction(() => document.body.textContent.includes('Re-Sync'), {polling:50});
        await page.evaluate(() => { window.fixture.applied=true });
        await click('Re-Sync');
        await page.waitForFunction(() => document.body.textContent.includes('Recorded · Entry transferred'), {polling:50});
        const { aliasReads,writes } = await page.evaluate(() => window.fixture);
        assert.deepEqual(writes,[]);
        assert.ok(aliasReads.some(([column,value])=>column==='metadata->>paystack_ref'&&value===reference));
    } finally {
        await browser.close();
    }
});
