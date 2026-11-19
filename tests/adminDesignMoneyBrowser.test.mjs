import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';

const platform = { role:'super_admin' };
const owner = { role:'org_owner', orgs:[{ id:'our-org', name:'Our organisation', member_role:'owner' }] };

const dataFixture = `
const fb = window.fixture;
const counters = fb.calls;
const actor = { id:'synthetic-actor', email:'operator@example.invalid' };
const event = { id:14, event_name:'Our fixture event', organisation_id:'our-org', is_manual:true, start_date:'2026-08-01', end_date:'2026-08-02', finance_managed:true, entry_fee:600, organiser_interim_payments:[] };
const other = { ...event, id:15,event_name:'Other organisation event',organisation_id:'other-org' };
const player = { id:5, name:'Fixture player', email:'player@example.invalid' };
const registration = {id:'reg-5',event_id:14,email:player.email,division:'Open',status:'registered',payment_status:'paid'};
const pay = {id:'p1',event_id:14,player_id:5,reference:'EVREG-FIXTURE-14',created_at:'2026-08-01T12:00:00Z',status:'success',is_test:false,payment_type:'event_entry_fee',payment_method:'paystack',amount:600,currency:'ZAR',metadata:{covers:[{type:'entry',email:player.email,division:'Open'}]},players:player,calendar:event};
const season = { year:2026,price:650,renewal_price:500,coverage_starts_on:'2026-01-01',sales_open:true };
const licence = { id:'fixture-licence', player_id:5, name:player.name, email:player.email, season_year:2026, license_type:'full', source:'manual',status:'active', starts_on:'2026-01-01',ends_on:'2026-12-31' };
const request = {id:'existing-payout',event_id:14,event_name:event.event_name,amount:200,last_four:'0155',status:'pending',created_at:'2026-08-05T10:00:00Z'};
let banking = { saved:true, bank_name:'Fixture Bank', last_four:'0155', version:'account-version' }, requests = fb.mode === 'payout-admin' ? [request] : [];
const platform = fb.permissions.role === 'super_admin';
const tables = { calendar:[event,other], players:[player], payments:[pay], payment_refunds:[], license_seasons:[season],
    commerce_config:[{id:'default',temp_license_price:120,temp_license_enabled:true}], organisations:[{id:'our-org',name:'Our organisation',status:'approved'}] };
function select(table) {
    const predicates = [];
    let remove=false, update, from=0, to=Infinity;
    const rows=()=> (tables[table] || []).filter(row => predicates.every(fn=>fn(row)));
    const execute=(mode='all')=>{
        const result=rows();
        if(remove) tables[table]=tables[table].filter(row=>!result.includes(row));
        if(update) for(const row of result) Object.assign(row,update);
        return {data: structuredClone(mode==='single'?result[0]||null:result.slice(from,to+1))};
    };
    return { select(){return this}, eq(key,value){predicates.push(row=>String(row[key])===String(value));return this}, neq(key,value){predicates.push(row=>row[key]!==value);return this},
        in(key,ids){predicates.push(row=>ids.includes(row[key]));return this}, is(key,val){predicates.push(row=>row[key]===val);return this},
        order(){return this}, limit(){return this}, abortSignal(){return this},
        update(value){update=value;return this}, delete(){remove=true;return this},
        range(start,end){counters.push(['table',table]);from=start;to=end;return this}, async single(){counters.push(['event',table]);return execute('single')},
        async maybeSingle(){if(remove)counters.push(['delete',table]);return execute('single')}, then(done,fail){return Promise.resolve(execute()).then(done,fail)} };
}
export const supabase = {
    supabaseUrl:'https://synthetic-test.invalid',
    auth:{async getUser(){return {data:{user:actor}}},mfa:{
        async listFactors(){return {data:{totp:[{id:'synthetic-factor',status:'verified'}]}}},
        async challengeAndVerify(data){counters.push(['mfa',data]);return {data:{}}},
    }},
    from:select,
    async rpc(name,args) {
        counters.push([name,args]);
        if(name==='can_manage_licenses' || name==='is_organisation_admin' || name==='is_super_admin') return {data:true};
        if(name==='get_player_licenses') return {data:{...player,licenses:[licence],payments:[],history:[]}};
        if(name==='license_sales_overview') return {data:{series:[],total_sold:1,new_full:1,license_years:[{license_year:2026,total_sold:1,new_full:1,ends_on:'2026-12-31',purchase_years:[]}]}};
        if(name==='manage_license'){
            if(args.p_action==='list')return {data:{rows:[licence],total:1,counts:{},current_counts:{full:1,total:1},reviews:[]}};
            if(args.p_action==='players')return {data:[player]};
            if(args.p_action==='revoke')licence.status='revoked';
            if(args.p_action==='restore')licence.status='active';
            return {data:{id:licence.id,saved:true}};
        }
        if(name==='event_checkout_state')return {data:{state:'awaiting_payment'}};
        if(name==='event_finance_overview_source')return {data:{events:[event],registrations:[registration],payments:[pay],divisions:[],refunds:[]}};
        if(name==='organisation_banking'){
            if(args.p_org_id!==event.organisation_id)return {error:{message:'Only organisation owners and admins can access banking.'}};
            switch(args.p_action){
                case 'summary': return {data:banking};
                case 'list': return {data:{requests,can_process:platform}};
                case 'request':requests=[{...request,id:args.p_data.request_id,amount:args.p_data.amount}];return {data:{request_id:args.p_data.request_id}};
                case 'remove':banking={saved:false};return {data:banking};
                case 'save':banking={saved:true,bank_name:args.p_data.bank_name,last_four:'0155',version:'new-version'};return {data:banking};
                case 'reveal':return {data:{bank_name:'Fixture Bank',account_holder:'Fixture Owner',account_number:'0000000155',branch_code:'000000',account_type:'current'}};
                case 'resolve':requests=requests.map(row=>({...row,status:args.p_data.status}));return {data:{status:args.p_data.status}};
            }
        }
        return {data:{}};
    },
    functions:{async invoke(name,args){
        counters.push([name,args?.body]);
        if(name.startsWith('paystack-transactions?'))return {data:{mode:'live',transactions:[
            {id:pay.reference,user:player.email,amount:'R 600.00',status:'Success',rawDate:pay.created_at,is_test:false},
            {id:'unmatched-reference',user:player.email,amount:'R 45.00',status:'Success',rawDate:pay.created_at,is_test:false},
        ]}};
        if(name==='confirm-manual-payment')return {data:{processed:true}};
        if(name==='event-cash-receipts')return {data:{next_offset:null,receipts:[{reference:pay.reference,amount:600,status:'success',verified:true}]}};
        if(name==='event-finance-summary')return {data:{summaries:[{id:14,
            stats:{entries:1,billed:600,collected:600,outstanding:0,paidCount:1,compedCount:0,uniquePlayersCount:1,licenses:{full:1,temp:0,none:0}},
            settlement:{basis:'current_registrations_v1',activeEntries:1,grossEntryFees:600,totalAmountBilled:600,pendingAmount:0,paid4M:1,paidClub:0,compedEntries:0,commission:30,interimPaid:0,organiserRetained:0,entryFeesRefunded:0,dueToOrg:570,issues:[]},
        }]}};
        return {data:{messageId:'synthetic-message'}};
    }},
};
`;
let browser, bundle;
before(async()=>{
    const built = await build({
        stdin:{ contents:`
            import { createRoot } from 'react-dom/client';
            import { MemoryRouter } from 'react-router-dom';
            import { supabase } from './src/supabaseClient';
            import Licences from './src/pages/admin-preview/LicensesWorkspace';
            import Finance from './src/pages/admin-preview/FinanceOverview';
            import Payments from './src/pages/admin-preview/PaymentsWorkspace';
            import Payouts from './src/pages/admin-preview/PayoutsWorkspace';
            const {mode,permissions,scopeId} = window.fixture;
            const linked = mode === 'payout-linked' ? {initialEventId:'14',initialOrganisationId:'our-org'}
                : mode === 'payout-link-other' ? {initialEventId:'15',initialOrganisationId:'other-org'} : {};
            const Component = mode.startsWith('licences') ? Licences : mode.startsWith('payout') ? Payouts : mode === 'gateway' ? Payments : Finance;
            createRoot(document.getElementById('root')).render(<MemoryRouter><Component {...linked} client={supabase} session={{user:{id:'synthetic-actor'}}} permissions={permissions} scopeId={scopeId} initialPlayerId={mode==='licences-player'?5:null} /></MemoryRouter>);
        `, resolveDir:process.cwd(), loader:'jsx',sourcefile:'synthetic-money.jsx'},
        jsx:'automatic', bundle:true, write:false, format:'iife', loader:{'.css':'empty'}, logLevel:'silent',
        plugins:[{name:'synthetic-finance',setup(builder){
            builder.onResolve({filter:/\/supabaseClient(?:\.js)?$/},()=>({path:'data',namespace:'fixture'}));
            builder.onResolve({filter:/^file-saver$/},()=>({path:'export',namespace:'fixture'}));
            builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='data'?dataFixture:'export const saveAs=(_blob,name)=>window.fixture.calls.push(["download",name]);'}));
        }}],
    });
    bundle = built.outputFiles[0].text;
    browser = await puppeteer.launch({headless:true,args:['--no-sandbox']});
});
after(async()=>{await browser?.close()});

async function withPage(mode, permissions, scopeId, run) {
    const page = await browser.newPage();
    page.setDefaultTimeout(7000);
    try {
        await page.setContent('<main id="root"></main>');
        await page.evaluate((mode,permissions,scopeId)=>{
            window.fixture={mode,permissions,scopeId,calls:[]};
            if (!crypto.randomUUID) Object.defineProperty(crypto,'randomUUID',{value:()=> '11111111-1111-4111-8111-111111111111'});
        },mode,permissions,scopeId);
        await page.addScriptTag({content:bundle});
        await run(page);
    } catch (error) {
        error.message += '\nSynthetic screen: ' + await page.evaluate(()=>document.body.innerText);
        throw error;
    } finally { await page.close(); }
}
const calls = page => page.evaluate(()=>window.fixture.calls);
const includesText = (page, text) => page.waitForFunction(value=>document.body.innerText.includes(value),{},text);
const click = async (page, name, selector='button') => {
    await page.waitForFunction((name,selector)=>[...document.querySelectorAll(selector)].some(node=>node.textContent.trim().includes(name)&&!node.disabled),{},name,selector);
    await page.evaluate((name,selector)=>[...document.querySelectorAll(selector)].find(node=>node.textContent.trim().includes(name)&&!node.disabled).click(),name,selector);
};
const input = async (page, selector, value) => {
    await page.waitForSelector(selector);
    await page.$eval(selector,(element,value)=>{
        const setter=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element),'value').set;
        setter.call(element,value);element.dispatchEvent(new Event('input',{bubbles:true}));element.dispatchEvent(new Event('change',{bubbles:true}));
    },value);
};
const verifyMfa = async page => {
    await input(page,'input[name="messaging-authenticator-code"]','123456');
    await click(page,'Verify code');
};

test('licence player and settings flows only save after their review confirmation',async()=>{
    await withPage('licences-player',platform,'all',async page=>{
        await click(page,'Add licence');
        await input(page,'textarea','Fixture grant');
        await click(page,'Review licence');
        assert.equal((await calls(page)).some(([name,args])=>name==='manage_license'&&args.p_action==='grant'),false);
        await click(page,'Confirm and save');
        await includesText(page,'Licence changes saved.');
        await click(page,'Revoke — review');await input(page,'textarea','Fixture revoke');await click(page,'Review revoke');await click(page,'Confirm and save');
        await click(page,'Restore — review');await input(page,'textarea','Fixture restore');await click(page,'Review restore');await click(page,'Confirm and save');
        assert.deepEqual((await calls(page)).filter(([name,args])=>name==='manage_license'&&['grant','revoke','restore'].includes(args.p_action)).map(([,args])=>args.p_action),
            ['grant','revoke','restore']);
    });
    await withPage('licences',platform,'all',async page=>{
        await click(page,'Overview');await click(page,'New Full licences');
        await page.waitForFunction(()=>window.fixture.calls.some(([name,args])=>name==='manage_license'&&args.p_input?.type==='new_full'));
        await click(page,'Sales and prices');await input(page,'.lw-root input:not([type])','Fixture settings change');
        await click(page,'Review 2026 settings');await click(page,'Back to editing');await click(page,'Review 2026 settings');await click(page,'Confirm and save');
        await includesText(page,'Licence changes saved.');
        assert.ok((await calls(page)).some(([name,args])=>name==='manage_license'&&args.p_action==='save_season'));
    });
});

test('Paystack records and live gateway actions keep saved-checkout verification explicit',async()=>{
    await withPage('gateway',platform,'all',async page=>{
        await click(page,'Paystack gateway');await includesText(page,'unmatched-reference');
        assert.ok((await calls(page)).some(([name])=>name.startsWith('paystack-transactions?mode=live')));
        await click(page,'Verify checkout');await click(page,'Cancel');assert.equal((await calls(page)).some(([name])=>name==='confirm-manual-payment'),false);
        await click(page,'Review page reconciliation');await click(page,'Confirm reconciliation');await includesText(page,'Checkout reconciled.');
        assert.deepEqual((await calls(page)).filter(([name])=>name==='confirm-manual-payment'),[['confirm-manual-payment',{reference:'EVREG-FIXTURE-14'}]]);
        await click(page,'Export page to Excel');await includesText(page,'Excel prepared');
        await click(page,'Gateway settings');await click(page,'Load Paystack in this workspace','label');await click(page,'Paystack gateway');await includesText(page,'Gateway loading is paused.');
    });
    await withPage('gateway',owner,'org:our-org',async page=>{
        await includesText(page,'Recorded payments require platform super-admin access.');
        assert.equal((await calls(page)).length,0);
    });
});

test('payout owner only sees own events and requests after gateway and MFA verification',async()=>{
    await withPage('payout-owner',owner,'org:our-org',async page=>{
        await click(page,'Select a manual event');
        await includesText(page,'Our fixture event');
        assert.equal((await page.evaluate(()=>document.body.innerText)).includes('Other organisation event'),false);
        await click(page,'Our fixture event','[role="option"]');
        await input(page,'input[type="number"]','100');
        await click(page,'Use Fixture Bank','label');await click(page,'Review payout request');
        assert.equal((await calls(page)).some(([name,args])=>name==='organisation_banking'&&args.p_action==='request'),false);
        await verifyMfa(page);await includesText(page,'Payout request saved');
        const audit = await calls(page);
        assert.ok(audit.some(([name,args])=>name==='organisation_banking'&&args.p_org_id==='our-org'&&args.p_action==='request'&&args.p_data.amount===100));
        assert.ok(audit.some(([name])=>name==='send-email'));
    });
    await withPage('payout-owner',owner,'org:other-org',async page=>{
        await includesText(page,'Select an organisation you own or administer.');
        assert.deepEqual(await calls(page),[]);
    });
});

test('platform payout reveal and resolution stay behind fresh authenticator actions',async()=>{
    await withPage('payout-admin',platform,'org:our-org',async page=>{
        await click(page,'Reveal');await verifyMfa(page);await includesText(page,'0000000155');
        await click(page,'Hide account details');assert.equal((await page.evaluate(()=>document.body.innerText)).includes('0000000155'),false);
        await click(page,'Mark paid');await verifyMfa(page);await includesText(page,'Payout status updated.');
        assert.ok((await calls(page)).some(([name,args])=>name==='organisation_banking'&&args.p_action==='resolve'&&args.p_data.status==='paid'));
        await click(page,'Remove saved account');await verifyMfa(page);await includesText(page,'No payout account saved');
    });
});

test('Finance reports show scoped settlements and review ledger deletion before applying',async()=>{
    await withPage('finance',platform,'all',async page=>{
        await click(page,'Event settlements');await includesText(page,'Our fixture event');
        assert.match(await page.$eval('a.fo-type-link',node=>node.getAttribute('href')),/admin-preview\/event\?event=14/);
        await click(page,'User ledger');await click(page,'View ledger');await click(page,'Delete record');
        assert.equal((await calls(page)).some(([name])=>name==='delete'),false);
        await click(page,'Confirm delete');await includesText(page,'Ledger record deleted.');
    });
    await withPage('finance',owner,'org:our-org',async page=>{
        await includesText(page,'Our fixture event');assert.equal((await page.evaluate(()=>document.body.innerText)).includes('Other organisation event'),false);
        const actions = await calls(page);
        assert.deepEqual(actions.find(([name])=>name==='is_organisation_admin'),['is_organisation_admin',{p_organisation_id:'our-org'}]);
        assert.deepEqual(actions.find(([name])=>name==='event-finance-summary'),['event-finance-summary',{event_ids:[14]}]);
    });
});

test('direct payout links preselect only an accessible organisation and its own manual event',async()=>{
    await withPage('payout-linked',platform,'all',async page=>{
        await includesText(page,'Balance due');
        assert.equal(await page.$eval('button[aria-pressed="true"]', node=>node.textContent),'Payout requests');
        assert.deepEqual((await calls(page)).find(([name])=>name==='event-cash-receipts'),['event-cash-receipts',{event_id:14,verify_all:true,verify_refunds:true,offset:0}]);
    });
    await withPage('payout-link-other',owner,'org:our-org',async page=>{
        await includesText(page,'Select a manual event');
        assert.equal((await calls(page)).some(([name])=>name==='event-cash-receipts'),false);
    });
});
