import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';
import { canOpenReviewPage } from '../src/pages/admin-preview/access.js';

const grant = (events = [], manager = []) => ({
  role:'custom', allowed_tabs:['finance'],
  module_permissions:{ finance:{ allowedTabs:['dashboard'], allowedEvents:events }, 'event-mgmt':{ allowedEvents:manager } },
});

const fixture = `
const sample = window.fixture;
const actor = { id:'dashboard-actor', email:'dashboard@example.invalid' };
const day = new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Johannesburg'}).format(new Date());
const dayBefore = new Date(Date.now()-90*86400000).toISOString().slice(0,10);
const events = [
  { id:14, event_name:'Managed event with balance', is_manual:true, finance_managed:true, start_date:day, entry_fee:600 },
  { id:16, event_name:'Managed settled event', is_manual:true, finance_managed:true, start_date:dayBefore, entry_fee:600 },
  { id:15, event_name:'Other event', is_manual:true, finance_managed:false, start_date:day, entry_fee:9000 },
];
if (sample.noManaged) for (const event of events) event.finance_managed=false;
const registration = {id:'entry-14',event_id:14,email:'player@example.invalid',division:'Open',status:'registered',payment_status:'paid'};
const payment = {id:'payment-14',event_id:14,status:'success',payment_method:'paystack',payment_type:'event_entry_fee',amount:600,
  reference:'EVREG-SCOPED-14',created_at:day,metadata:{source:'manual_event',registration_id:registration.id, covers:[{type:'entry',email:registration.email,division:'Open'}]}};
const otherPayment = {...payment,event_id:15,amount:9000,reference:'OUTSIDE-FINANCE',id:'other-payment'};
const otherRegistration = {...registration,id:'other-entry',event_id:15,email:'other@example.invalid'};
const session = {user:actor};
const data = value => ({data:value});
const request = callback => ({ abortSignal(){return this;},then(resolve,reject){return Promise.resolve().then(callback).then(resolve,reject);} });
function source(ids) {
  const include = row => ids.includes(row.event_id);
  return {
    events:events.filter(row=>ids.includes(row.id)),
    registrations:[registration,otherRegistration].filter(include),payments:[payment,otherPayment].filter(include),
    refunds:[],divisions:[],participants:[],licenses:[],
  };
}
function table(name) {
  let filters = [], range = [0,Infinity];
  function read(single) {
    sample.calls.push(['table',name,filters]);
    const tables = {calendar:events,admin_sidebar_permissions:[{email:actor.email,...sample.liveGrant}],
        commerce_config:[{id:'default'}],license_seasons:[],players:[],organisation_members:[],club_members:[],federation_members:[]};
    const rows = (tables[name] || []).filter(row => filters.every(([type,key,value]) =>
        type==='in'?value.includes(row[key]):type==='is'?(row[key] ?? null)===value:row[key]===value));
    return data(single ? rows[0] || null : rows.slice(range[0],range[1]+1));
  }
  return { select(){return this;}, order(){return this;}, abortSignal(){return this;},
    eq(key,value){filters.push(['eq',key,value]);return this;},ilike(key,value){return this.eq(key,value);},
    in(key,values){filters.push(['in',key,values]);return this;},is(key,value){filters.push(['is',key,value]);return this;},
    range(from,to){range=[from,to];return this;},
    maybeSingle(){return Promise.resolve(read(true));},then(resolve,reject){return Promise.resolve(read(false)).then(resolve,reject);}
  };
}
export const supabase = {
  auth:{getUser:async()=>data({user:session.user})}, from:table,
  rpc(name,args) {
    sample.calls.push(['rpc',name,args]);
    if(name==='account_is_active')return request(()=>data(true));
    if(name==='is_super_admin')return request(()=>data(false));
    if(name==='event_finance_overview_source')return request(()=>{
      const result=source(args.p_event_ids);
      if(sample.invalidSource) result.payments.push(otherPayment);
      if(sample.removeManaged) events.find(event=>event.id===14).finance_managed=false;
      return data(result);
    });
    return request(()=>data([]));
  },
};
`;

let browser, bundle;
before(async()=>{
  const result = await build({ stdin:{ contents:`
    import { createRoot } from 'react-dom/client';
    import { MemoryRouter } from 'react-router-dom';
    import { supabase } from './src/supabaseClient';
    import FinanceOverview from './src/pages/admin-preview/FinanceOverview';
    import { canOpenReviewPage } from './src/pages/admin-preview/access';
    const {permissions}=window.fixture;
    const view = canOpenReviewPage(permissions,'reports')
      ? <FinanceOverview client={supabase} session={{user:{id:'dashboard-actor'}}} permissions={permissions} scopeId="all" />
      : <p>Finance report access required.</p>;
    createRoot(document.getElementById('root')).render(<MemoryRouter>{view}</MemoryRouter>);
  `,loader:'jsx',resolveDir:process.cwd()},bundle:true,write:false,format:'iife',jsx:'automatic',
  logLevel:'silent',loader:{'.css':'empty'},
  plugins:[{name:'synthetic-collections',setup(builder){
    builder.onResolve({filter:/\/supabaseClient(?:\.js)?$/},()=>({path:'fixture',namespace:'synthetic'}));
    builder.onLoad({filter:/.*/,namespace:'synthetic'},()=>({contents:fixture}));
  }}] });
  bundle = result.outputFiles[0].text;
  browser = await puppeteer.launch({headless:true,args:['--no-sandbox']});
});
after(async()=>{await browser?.close()});

async function withPage(permissions, values, run) {
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request',request=>request.abort());
  page.setDefaultTimeout(8000);
  try {
    await page.setContent('<main id="root"></main>');
    await page.evaluate((permissions,values)=>{window.fixture={permissions,liveGrant:structuredClone(permissions),calls:[],...values};},permissions,values);
    await page.addScriptTag({content:bundle});
    await run(page);
  } catch (error) {
    error.message += '\nSynthetic screen: ' + await page.evaluate(()=>document.body.innerText);
    throw error;
  } finally {await page.close();}
}
const textMatches = (page,value) => page.waitForFunction(value=>document.body.innerText.includes(value),{},value);
const calls = page => page.evaluate(()=>window.fixture.calls);
async function clickButton(page, label) {
  await page.waitForFunction(label=>[...document.querySelectorAll('button')].some(button=>button.textContent.trim()===label&&!button.disabled),{},label);
  await page.evaluate(label=>[...document.querySelectorAll('button')].find(button=>button.textContent.trim()===label&&!button.disabled).click(),label);
}
const sources = async page => (await calls(page)).filter(([kind,name])=>kind==='rpc'&&name==='event_finance_overview_source').map(([, ,args])=>args.p_event_ids);
async function selectFilter(page, option) {
  await page.$eval('button[aria-label="Filter collection events"]',button=>button.click());
  await page.waitForFunction(option=>[...document.querySelectorAll('[role="option"]')].some(row=>row.textContent.trim()===option),{},option);
  await page.evaluate(option=>[...document.querySelectorAll('[role="option"]')].find(row=>row.textContent.trim()===option).click(),option);
}
async function eventTable(page) {
  return page.$eval('[aria-label="Event collection figures"]',table=>table.innerText);
}

test('a Dashboard-only Finance assignment opens the managed scope with existing filter controls',async()=>{
  assert.equal(canOpenReviewPage(grant(),'reports'),true);
  assert.equal(canOpenReviewPage(grant(),'payments'),false);
  await withPage(grant(), {}, async page=>{
    await textMatches(page,'Finance-managed events');
    await textMatches(page,'Managed event with balance');
    assert.match(await eventTable(page),/Managed settled event/);
    assert.doesNotMatch(await eventTable(page),/Other event|9.?000/);
    assert.deepEqual(await sources(page),[[14,16]]);
    assert.equal((await calls(page)).some(([kind,table])=>kind==='table'&&['payments','payment_refunds'].includes(table)),false);
    assert.equal(await page.$$eval('[aria-label="Event collection figures"] a',nodes=>nodes.length),0);
    await selectFilter(page,'Outstanding');
    assert.match(await eventTable(page),/Managed event with balance/);
    assert.doesNotMatch(await eventTable(page),/Managed settled event/);
    await selectFilter(page,'Settled');
    assert.match(await eventTable(page),/Managed settled event/);
    assert.doesNotMatch(await eventTable(page),/Managed event with balance/);
    await selectFilter(page,'This month');
    assert.match(await eventTable(page),/Managed event with balance/);
    assert.doesNotMatch(await eventTable(page),/Managed settled event/);
    await clickButton(page,'Refresh collections');
    await textMatches(page,'Managed event with balance');
    assert.deepEqual(await sources(page),[[14,16],[14,16]]);
  });
});

test('explicit Finance event IDs and existing Event Manager assignment take precedence over dashboard defaults',async()=>{
  await withPage(grant([15],[14]), {}, async page=>{
    await textMatches(page,'Other event');
    assert.deepEqual(await sources(page),[[15]]);
    assert.doesNotMatch(await eventTable(page),/Managed event/);
    assert.equal(await page.$$eval('[aria-label="Event collection figures"] a',nodes=>nodes.length),0);
  });
  await withPage(grant([],[15]), {}, async page=>{
    await textMatches(page,'Other event');
    assert.deepEqual(await sources(page),[[15]]);
    assert.equal(await page.$eval('[aria-label="Event collection figures"] a',node=>node.getAttribute('href')), '/admin-preview/event?event=15&tab=statement');
  });
});

test('a stale grant, invalid returned record or changed finance-managed scope cannot render a dashboard',async()=>{
  await withPage(grant([14]), {liveGrant:grant([15])}, async page=>{
    await textMatches(page,'Your Finance Dashboard access or assigned events changed.');
    assert.deepEqual(await sources(page),[]);
    assert.equal((await calls(page)).some(([type,table])=>type==='table'&&table==='calendar'),false);
    await page.evaluate(()=>{window.fixture.liveGrant=window.fixture.permissions;});
    await clickButton(page,'Try again');
    await textMatches(page,'Managed event with balance');
    assert.deepEqual(await sources(page),[[14]]);
  });
  await withPage(grant([14]), {invalidSource:true}, async page=>{
    await textMatches(page,'The event finance records could not be verified for this scope.');
    assert.deepEqual(await sources(page),[[14]]);
    assert.equal(await page.$('[aria-label="Event collection figures"]'),null);
  });
  await withPage(grant(), {removeManaged:true}, async page=>{
    await textMatches(page,'The Finance-managed events changed while loading.');
    assert.equal(await page.$('[aria-label="Event collection figures"]'),null);
  });
});

test('tenant or empty managed scope never falls back to a broad finance query',async()=>{
  const tenant={...grant(),clubs:[{id:'club-1',member_role:'admin'}]};
  assert.equal(canOpenReviewPage(tenant,'reports'),false);
  await withPage(tenant, {}, async page=>{
    await textMatches(page,'Finance report access required.');
    assert.deepEqual(await calls(page),[]);
  });
  await withPage(grant(), {noManaged:true}, async page=>{
    await textMatches(page,'No events match this filter.');
    assert.deepEqual(await sources(page),[]);
    const calendar=(await calls(page)).filter(([kind,name])=>kind==='table'&&name==='calendar');
    assert.ok(calendar.length);
    assert.ok(calendar.every(([, ,filters])=>filters.some(([type,name,value])=>type==='eq'&&name==='finance_managed'&&value===true)));
  });
});
