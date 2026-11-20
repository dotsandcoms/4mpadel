import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';
import ExcelJS from 'exceljs';

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
const reference = fb.mode === 'gateway-native' ? 'MOBILE-ROCKETS-CUP-17949878596810000000000' : 'EVREG-FIXTURE-14';
const pay = {id:'p1',event_id:14,player_id:5,reference,checkout_source:'manual_event',created_at:'2026-08-01T12:00:00Z',status:'success',is_test:false,payment_type:'event_entry_fee',payment_method:'paystack',amount:600,currency:'ZAR',metadata:{covers:[{type:'entry',email:player.email,division:'Open'}]},players:player,calendar:event};
const season = { year:2026,price:650,renewal_price:500,coverage_starts_on:'2026-01-01',sales_open:true };
const licence = { id:'fixture-licence', player_id:5, name:player.name, email:player.email, season_year:2026, license_type:'full', source:'manual',status:'active', starts_on:'2026-01-01',ends_on:'2026-12-31' };
const request = {id:'existing-payout',event_id:14,event_name:event.event_name,amount:200,last_four:'0155',status:'pending',created_at:'2026-08-05T10:00:00Z'};
let banking = { saved:true, bank_name:'Fixture Bank', last_four:'0155', version:'account-version' }, requests = fb.mode === 'payout-admin' ? [request] : [];
const platform = fb.permissions.role === 'super_admin';
const ledgerScopeTest = fb.mode.startsWith('finance-ledger-');
const gatewayBulk = fb.mode === 'gateway-bulk';
const gatewayTypes = fb.mode === 'gateway-types';
const typedRefs = ['full', 'temporary', ...Array.from({length:9},(_,index)=>'other-'+index),'full-alias','ambiguous','missing'];
const typeRef = label => 'type-fixture-'+label;
const typedGatewayRows = typedRefs.map(label=>({id:typeRef(label),user:player.email,amount:'R 650.00',
    status:label==='full-alias'?'Failed':'Success',rawDate:pay.created_at,is_test:false}));
const retrievalFailures = new Set(gatewayBulk ? ['bulk-12'] : []);
const otherPlayer = {id:6,name:'Outside ledger player',email:'outside@example.invalid'};
const failed = {...pay,id:'failed-own',reference:'assigned-entry-failed',status:'failed',amount:20};
const otherPayment = {...pay,id:'other-pay',event_id:15,player_id:6,reference:'outside-scope-reference',players:otherPlayer,calendar:other};
const tables = { calendar:[event,other], players:[player], payments:[pay], payment_refunds:[], license_seasons:[season],
    commerce_config:[{id:'default',temp_license_price:120,temp_license_enabled:true}], organisations:[{id:'our-org',name:'Our organisation',status:'approved'}] };
if (ledgerScopeTest) {
    tables.calendar[1] = {...other,finance_managed:false};
    tables.players.push(otherPlayer);
    tables.payments.push(failed,otherPayment,{...otherPayment,id:'other-pay-same-player',player_id:5,reference:'outside-for-same-player'});
}
if (gatewayBulk) tables.payments.push({...pay,id:'linked-bulk',reference:'bulk-linked'});
if (gatewayTypes) tables.payments.push(
    {...pay,id:'full-kind',reference:typeRef('full'),payment_type:'full_license',amount:650},
    {...pay,id:'temp-kind',reference:typeRef('temporary'),payment_type:'temporary_license',amount:650},
    {...pay,id:'full-alias-kind',reference:'600899',client_reference:typeRef('full-alias'),payment_type:'membership',amount:650},
    {...pay,id:'full-ambiguous-kind',reference:typeRef('ambiguous'),payment_type:'full_license',amount:650},
    {...pay,id:'temp-ambiguous-kind',reference:'600900',client_reference:typeRef('ambiguous'),payment_type:'temp_license',amount:650},
    {...pay,id:'known-other-kind',reference:typeRef('other-0'),payment_type:'event_entry_fee',amount:650},
    {...pay,id:'wrong-environment-kind',reference:typeRef('other-1'),payment_type:'full_license',amount:650,is_test:true},
);
function select(table) {
    const predicates = [];
    let remove=false, update, from=0, to=Infinity, fields='';
    const filters = [];
    const rows=()=> (table==='admin_sidebar_permissions' && ledgerScopeTest
        ? [{...fb.liveGrant,email:actor.email}] : tables[table] || []).filter(row => predicates.every(fn=>fn(row)));
    const execute=(mode='all')=>{
        const result=rows();
        if (gatewayTypes && table==='payments' && !fields.includes('players!') && fields.includes('client_reference:metadata->>client_reference')) {
            counters.push(['type-projection',fields,filters]);
            if (fb.failClassification) return {error:new Error('Fixture type lookup failed')};
        }
        if(update && table==='calendar') counters.push(['update',table,result.map(r=>r.id),update]);
        if(remove) tables[table]=tables[table].filter(row=>!result.includes(row));
        if(update) for(const row of result) Object.assign(row,update);
        return {data: structuredClone(mode==='single'?result[0]||null:result.slice(from,to+1))};
    };
    return { select(value){fields=value;return this}, ilike(key,value){predicates.push(row=>String(row[key]||'').toLowerCase()===value.toLowerCase());return this}, eq(key,value){filters.push(['eq',key,value]);predicates.push(row=>(row[key] !== null && typeof row[key] === 'object' ? JSON.stringify(row[key]) : String(row[key]))===String(value));return this}, neq(key,value){predicates.push(row=>row[key]!==value);return this},
        in(key,ids){filters.push(['in',key,ids]);predicates.push(row=>ids.includes(key === 'metadata->>client_reference' ? row.client_reference : row[key]));return this}, is(key,val){predicates.push(row=>row[key]===val);return this},
        order(){return this}, limit(){return this}, abortSignal(){return this},
        update(value){update=value;return this}, delete(){remove=true;return this},
        range(start,end){counters.push(['table',table]);if(ledgerScopeTest)counters.push(['filtered-read',table,filters]);from=start;to=end;return this}, async single(){counters.push(['event',table]);return execute('single')},
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
        if(name==='is_super_admin' && ledgerScopeTest) return {data:platform};
        if(name==='account_is_active') return {data:true};
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
            ...(gatewayTypes ? typedGatewayRows : []),
            ...(gatewayBulk ? [...Array.from({length:12}, (_,index)=>({id:'bulk-'+String(index+1).padStart(2,'0'),user:player.email,
                amount:'R 45.00',status:'Success',rawDate:pay.created_at,is_test:false})),
                {id:'bulk-linked',user:player.email,amount:'R 600.00',status:'Success',rawDate:pay.created_at,is_test:false},
                {id:'bulk-failed',user:player.email,amount:'R 45.00',status:'Failed',rawDate:pay.created_at,is_test:false},
                {id:'different-customer',user:player.email,amount:'R 45.00',status:'Success',rawDate:pay.created_at,is_test:false},
            ] : []),
        ]}};
        if(name==='confirm-manual-payment')return {data:{processed:true}};
        if(name==='admin-paystack-backfill') {
            if(args.body.action==='review') {
                if(retrievalFailures.delete(args.body.reference))return {error:new Error('Fixture verification temporarily unavailable')};
                if(tables.payments.some(row=>row.id==='backfilled-'+args.body.reference))return {data:{state:'already_recorded'}};
                return {data:{state:'review',token:'a'.repeat(64),kind:'unallocated',reference:args.body.reference,amountMinor:4500,payer:player.email}};
            }
            tables.payments.push({...pay, reference:String(700000+tables.payments.length),id:'backfilled-'+args.body.reference,event_id:null,payment_type:'other',amount:45,
                 checkout_source:'admin_paystack_backfill',client_reference:args.body.reference,verified_gateway_amount_minor:'4500'});
            if(gatewayBulk && args.body.reference==='bulk-11')return {error:new Error('Fixture recording response lost')};
            return {data:{state:'recorded',kind:'unallocated'}};
        }
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
            const Component = mode.startsWith('licences') ? Licences : mode.startsWith('payout') ? Payouts : mode.startsWith('gateway') ? Payments : Finance;
            createRoot(document.getElementById('root')).render(<MemoryRouter><Component {...linked} client={supabase} session={{user:{id:'synthetic-actor'}}} permissions={permissions} scopeId={scopeId} initialPlayerId={mode==='licences-player'?5:null} /></MemoryRouter>);
        `, resolveDir:process.cwd(), loader:'jsx',sourcefile:'synthetic-money.jsx'},
        jsx:'automatic', bundle:true, write:false, format:'iife', loader:{'.css':'empty'}, logLevel:'silent',
        plugins:[{name:'synthetic-finance',setup(builder){
            builder.onResolve({filter:/\/supabaseClient(?:\.js)?$/},()=>({path:'data',namespace:'fixture'}));
            builder.onResolve({filter:/^file-saver$/},()=>({path:'export',namespace:'fixture'}));
            builder.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='data'?dataFixture:'export const saveAs=(blob,name)=>{window.fixture.exportBlob=blob;window.fixture.calls.push(["download",name]);};'}));
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
            window.fixture={mode,permissions,scopeId,calls:[],liveGrant:permissions};
            if (mode.startsWith('finance-ledger-')) {
                const pending = new Map();
                URL.createObjectURL = blob => {
                    const url = 'blob:ledger-fixture-' + pending.size;
                    pending.set(url, blob);
                    return url;
                };
                URL.revokeObjectURL = url => pending.delete(url);
                HTMLAnchorElement.prototype.click = function () {
                    if (this.download) pending.get(this.href)?.text().then(csv=>window.fixture.calls.push(['csv',this.download,csv]));
                };
            }
            let nextId=0;
            if (!crypto.randomUUID) Object.defineProperty(crypto,'randomUUID',{value:()=> `11111111-1111-4111-8111-${String(++nextId).padStart(12,'0')}`});
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

test('an exact recorded native Paystack checkout is reconciled through the existing server verification',async()=>{
    await withPage('gateway-native',platform,'all',async page=>{
        await click(page,'Paystack gateway');
        await includesText(page,'MOBILE-ROCKETS-CUP-17949878596810000000000');
        await click(page,'Verify checkout'); await click(page,'Confirm reconciliation');
        await includesText(page,'Checkout reconciled.');
        const references='MOBILE-ROCKETS-CUP-17949878596810000000000';
        const actions=(await calls(page)).filter(([name])=>['event_checkout_state','confirm-manual-payment'].includes(name));
        assert.deepEqual(actions,[['event_checkout_state',{p_reference:references}],['confirm-manual-payment',{reference:references}]]);
    });
});

test('payout banking replacement and cancellation require separate reviewed MFA actions',async()=>{
    await withPage('payout-admin',platform,'org:our-org',async page=>{
        await click(page,'Replace banking details');
        await input(page,'input[name="bank_name"]','Replacement Bank');
        await input(page,'input[name="account_holder"]','Fixture Account');
        await input(page,'input[name="account_number"]','0000000123');
        await input(page,'input[name="confirmation"]','0000000123');
        await input(page,'input[name="branch_code"]','001234');
        await click(page,'Select account type');await click(page,'Savings','[role="option"]');
        await click(page,'I confirm these are the organisation','label');
        await click(page,'Review banking details');
        assert.equal((await calls(page)).some(([name,args])=>name==='organisation_banking'&&args.p_action==='save'),false);
        await verifyMfa(page);await includesText(page,'Replacement Bank');
        await click(page,'Cancel request');await verifyMfa(page);await includesText(page,'Payout status updated.');
        const writes=(await calls(page)).filter(([name,args])=>name==='organisation_banking'&&['save','resolve'].includes(args.p_action));
        assert.equal(writes[0][1].p_org_id,'our-org');
        assert.equal(writes[0][1].p_data.expected_version,'account-version');
        assert.equal(writes[0][1].p_data.account_type,'savings');
        assert.equal(writes[1][1].p_data.status,'cancelled');
        assert.equal(writes[1][1].p_data.request_id,'existing-payout');
    });
});
test('recording and removing an interim payout changes only the selected event after review',async()=>{
    await withPage('payout-admin',platform,'org:our-org',async page=>{
        await click(page,'Select a manual event');await click(page,'Our fixture event','[role="option"]');
        await click(page,'Recorded interim payments','summary');
        await input(page,'input[type="number"][step="0.01"]','45');
        await input(page,'input[type="date"]','2026-08-02');
        await click(page,'Review recorded payment');
        assert.equal((await calls(page)).some(([name])=>name==='update'),false);
        await click(page,'Confirm recorded payout change');await includesText(page,'Interim payment recorded.');
        await click(page,'Recorded interim payments','summary');
        await click(page,'Remove recorded payment');await click(page,'Confirm recorded payout change');
        await includesText(page,'Interim payment removed.');
        const updates=(await calls(page)).filter(([name])=>name==='update');
        assert.deepEqual(updates.map(([,table,ids])=>[table,ids]),[['calendar',[14]],['calendar',[14]]]);
        assert.equal(updates[0][3].organiser_interim_payments[0].amount,45);
        assert.deepEqual(updates[1][3].organiser_interim_payments,[]);
    });
});

test('the original gateway confirms reviewed unmatched funds and links the recorded alias after refresh',async()=>{
    await withPage('gateway',platform,'all',async page=>{
        await click(page,'Paystack gateway');await includesText(page,'unmatched-reference');
        await click(page,'Review missing receipt');
        await includesText(page,'Record as unallocated funds.');
        const first=(await calls(page)).filter(([name])=>name==='admin-paystack-backfill');
        assert.deepEqual(first,[['admin-paystack-backfill',{action:'review',scopeId:'all',reference:'unmatched-reference'}]]);
        assert.equal(await page.evaluate(()=>[...document.querySelectorAll('button')].find(node=>node.textContent==='Confirm receipt recording').disabled),true);
        await input(page,'section[aria-label="Review missing Paystack receipts"] textarea','Reviewed source receipt');
        await click(page,'Confirm receipt recording');await includesText(page,'Receipt recorded in the 4M ledger.');
        const after=(await calls(page)).filter(([name])=>name==='admin-paystack-backfill');
        assert.deepEqual(after[1],['admin-paystack-backfill',{action:'record',token:'a'.repeat(64),reason:'Reviewed source receipt',scopeId:'all',reference:'unmatched-reference'}]);
        await click(page,'Close and refresh gateway');
        await includesText(page,'Exact 4M gateway alias match');
        assert.equal(await page.evaluate(()=>[...document.querySelectorAll('button')].some(node=>node.textContent==='Review missing receipt')),false);
    });
});

test('gateway bulk reviews every matching page in bounded confirmed batches and retries using fresh evidence',async()=>{
    await withPage('gateway-bulk',platform,'all',async page=>{
        const reviewed = async () => (await calls(page)).filter(([name,args])=>name==='admin-paystack-backfill'&&args.action==='review').map(([,args])=>args.reference);
        const recorded = async () => (await calls(page)).filter(([name,args])=>name==='admin-paystack-backfill'&&args.action==='record').map(([,args])=>args.reference);
        const expected = Array.from({length:12},(_,index)=>'bulk-'+String(index+1).padStart(2,'0'));
        await click(page,'Paystack gateway');
        await input(page,'input[aria-label="Search gateway transactions"]','bulk-');
        await includesText(page,'Page 1 of 2');
        assert.equal((await page.$eval('table[aria-label], .fo-detail-table',table=>table.innerText)).includes('bulk-12'),false);
        await click(page,'Review all missing receipts');
        await includesText(page,'12 missing receipts in the filtered results. Batch 1 of 2.');
        await includesText(page,'Record as unallocated funds.');
        assert.deepEqual(await reviewed(),expected.slice(0,10));
        assert.deepEqual(await recorded(),[]);
        await input(page,'section[aria-label="Review missing Paystack receipts"] textarea','Reviewed first batch');
        await click(page,'Confirm receipt recording');
        await includesText(page,'Receipt recording results');
        assert.deepEqual(await recorded(),expected.slice(0,10));
        await click(page,'Review next batch');
        await includesText(page,'Batch 2 of 2.');
        await includesText(page,'The receipt operation could not be confirmed.');
        assert.deepEqual(await reviewed(),expected);
        assert.deepEqual(await recorded(),expected.slice(0,10));
        await click(page,'Retry batch verification');
        await page.waitForFunction(()=>document.querySelectorAll('section[aria-label="Review missing Paystack receipts"] li').length>=2
            && [...document.querySelectorAll('section[aria-label="Review missing Paystack receipts"] li')].filter(row=>row.innerText.includes('Record as unallocated funds.')).length===2);
        await input(page,'section[aria-label="Review missing Paystack receipts"] textarea','Verified remaining receipts');
        await click(page,'Confirm receipt recording');
        await includesText(page,'Receipt recording results');
        assert.deepEqual(await recorded(),expected);
        assert.deepEqual(await reviewed(),[...expected,'bulk-11','bulk-12']);
        await click(page,'Recheck receipt results');
        await includesText(page,'An existing ledger entry already uses this receipt.');
        assert.deepEqual(await reviewed(),[...expected,'bulk-11','bulk-12','bulk-11','bulk-12']);
        assert.deepEqual(await recorded(),expected);
        await click(page,'Close and refresh gateway');
        await click(page,'Review all missing receipts');
        await includesText(page,'There are no unmatched successful receipts in these results.');
        assert.deepEqual(await recorded(),expected);
    });
});

const financeLedgerGrant = (events = [14]) => ({
    role:'custom', allowed_tabs:['finance'], module_permissions:{finance:{allowedTabs:['users'],allowedEvents:events}},
});

test('standalone Finance Users can inspect and export only exact assigned ledger payments',async()=>{
    await withPage('finance-ledger-assigned',financeLedgerGrant(),'all',async page=>{
        await click(page,'User ledger');
        await includesText(page,'Assigned finance events');
        await click(page,'View ledger');
        await includesText(page,'assigned-entry-failed');
        const ledgerText = await page.$eval('table[aria-label="Selected player payment records"]',table=>table.innerText);
        assert.match(ledgerText,/EVREG-FIXTURE-14/);
        assert.doesNotMatch(ledgerText,/outside|Delete record/);
        assert.equal(await page.evaluate(()=>document.body.innerText.includes('Delete record')),false);
        await click(page,'Export detailed ledger CSV');
        await page.waitForFunction(()=>window.fixture.calls.some(([name])=>name==='csv'));
        await click(page,'Export player summary CSV');
        await page.waitForFunction(()=>window.fixture.calls.filter(([name])=>name==='csv').length===2);
        const scopes = (await calls(page)).filter(([type,table])=>type==='filtered-read'&&['payments','players'].includes(table));
        assert.ok(scopes.some(([,table])=>table==='payments'));
        assert.ok(scopes.some(([,table])=>table==='players'));
        for (const [,table,filters] of scopes) assert.deepEqual(filters,[table==='payments'?['in','event_id',[14]]:['in','id',[5]]]);
        const exports = (await calls(page)).filter(([name])=>name==='csv');
        assert.match(exports[0][2],/assigned-entry-failed/);
        assert.match(exports[1][2],/Fixture player/);
        assert.doesNotMatch(exports.map(row=>row[2]).join(' '),/outside|Outside/);
        await page.evaluate(()=>{window.fixture.liveGrant.module_permissions.finance.allowedEvents=[15]});
        await click(page,'Export detailed ledger CSV');
        await includesText(page,'Your User Ledger access or assigned events changed.');
        assert.equal((await calls(page)).filter(([name])=>name==='csv').length,2);
    });
});

test('standalone Users with no assignments only query IDs of current finance-managed events',async()=>{
    await withPage('finance-ledger-managed',financeLedgerGrant([]),'all',async page=>{
        await includesText(page,'Finance-managed events');
        await click(page,'View ledger');
        await includesText(page,'assigned-entry-failed');
        const actions = (await calls(page)).filter(([type])=>type==='filtered-read');
        assert.deepEqual(actions.find(([,table])=>table==='calendar'),['filtered-read','calendar',[['eq','finance_managed',true]]]);
        assert.deepEqual(actions.find(([,table])=>table==='payments'),['filtered-read','payments',[['in','event_id',[14]]]]);
        assert.equal(await page.evaluate(()=>document.body.innerText.includes('Delete record')),false);
    });
});

test('organisation owners receive no scoped or platform User Ledger from a direct-looking Users grant',async()=>{
    await withPage('finance-ledger-owner',{...financeLedgerGrant(),...owner},'org:our-org',async page=>{
        await includesText(page,'Our fixture event');
        assert.equal(await page.evaluate(()=>document.body.innerText.includes('User ledger')),false);
        assert.equal((await calls(page)).some(([type,table])=>type==='filtered-read'&&['payments','players'].includes(table)),false);
    });
});

async function gatewayDropdown(page, label, option) {
    const selector = 'button[aria-label="'+label+'"]';
    await page.waitForSelector(selector);
    await page.$eval(selector,node=>node.click());
    await page.waitForFunction(option=>[...document.querySelectorAll('[role="option"] span:first-child')].some(node=>node.textContent===option),{},option);
    await page.evaluate(option=>[...document.querySelectorAll('[role="option"] span:first-child')].find(node=>node.textContent===option).click(),option);
}

test('gateway receipt type filters exact stored licence types across pages and keeps unknown or ambiguous receipts unclassified',async()=>{
    await withPage('gateway-types',platform,'all',async page=>{
        const checkTable = async () => page.$eval('[aria-label="Paystack gateway transactions"] tbody',tbody=>tbody.innerText);
        await click(page,'Paystack gateway');
        await input(page,'input[aria-label="Search gateway transactions"]','type-fixture-');
        await includesText(page,'14 matching live transactions');
        assert.equal((await checkTable()).includes('type-fixture-full-alias'),false);
        assert.equal((await calls(page)).some(([name])=>name==='type-projection'),false);
        await gatewayDropdown(page,'Receipt type','Full licence');
        await includesText(page,'2 matching live transactions');
        assert.match(await checkTable(),/type-fixture-full-alias/);
        assert.doesNotMatch(await checkTable(),/type-fixture-temporary|type-fixture-ambiguous|type-fixture-missing/);
        await click(page,'Export page to Excel');
        await includesText(page,'Excel prepared with 2 transactions from this page.');
        const bytes = await page.evaluate(async()=>[...new Uint8Array(await window.fixture.exportBlob.arrayBuffer())]);
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(Buffer.from(bytes));
        assert.equal(workbook.getWorksheet('Gateway page').rowCount,3);
        assert.ok(workbook.getWorksheet('Export details').getRows(1,20).some(row=>
            row.getCell(1).value==='Stored 4M receipt type'&&row.getCell(2).value==='Full licence'));
        await gatewayDropdown(page,'Gateway status','Failed');
        await includesText(page,'1 matching live transactions');
        assert.match(await checkTable(),/type-fixture-full-alias/);
        assert.doesNotMatch(await checkTable(),/type-fixture-full\s/);
        await gatewayDropdown(page,'Gateway status','All statuses');
        await gatewayDropdown(page,'Receipt type','Temporary licence');
        await includesText(page,'1 matching live transactions');
        assert.match(await checkTable(),/type-fixture-temporary/);
        assert.doesNotMatch(await checkTable(),/type-fixture-full/);
        await gatewayDropdown(page,'Receipt type','Unclassified / other');
        await includesText(page,'11 matching live transactions');
        await click(page,'Next');
        await includesText(page,'type-fixture-missing');
        await click(page,'Previous');
        await includesText(page,'type-fixture-ambiguous');
        assert.match(await checkTable(),/Multiple 4M records/);
        assert.doesNotMatch(await checkTable(),/type-fixture-full|type-fixture-temporary/);
        const selections = (await calls(page)).filter(([name])=>name==='type-projection');
        assert.ok(selections.length);
        for (const [,fields,filters] of selections) {
            assert.equal(fields,'id,reference,is_test,payment_method,payment_type,client_reference:metadata->>client_reference');
            assert.ok(filters.some(([operator,key,ids])=>operator==='in'&&['reference','metadata->>client_reference'].includes(key)
                &&ids.every(id=>id.startsWith('type-fixture-'))));
        }
        assert.equal((await calls(page)).some(([name])=>name==='admin-paystack-backfill'),false);
    });
});

test('gateway errors do not silently assign stored receipt types',async()=>{
    await withPage('gateway-types',platform,'all',async page=>{
        await click(page,'Paystack gateway');
        await input(page,'input[aria-label="Search gateway transactions"]','type-fixture-');
        await includesText(page,'14 matching live transactions');
        await page.evaluate(()=>{window.fixture.failClassification=true});
        await gatewayDropdown(page,'Receipt type','Unclassified / other');
        await includesText(page,'Stored receipt types could not be verified.');
        assert.equal(await page.$('[aria-label="Paystack gateway transactions"]'),null);
        await page.evaluate(()=>{window.fixture.failClassification=false});
        await click(page,'Try again');
        await includesText(page,'11 matching live transactions');
    });
});
