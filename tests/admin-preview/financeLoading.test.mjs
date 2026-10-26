import test from 'node:test';
import assert from 'node:assert/strict';
import {loadFinancePaymentLinks,createFinanceLinkCache} from '../../src/pages/admin-preview/financeOverviewData.js';

const session={user:{id:'test-admin'}};
const permissions={role:'super_admin'};

test('report cache reuses checked IDs and fetches only new IDs',async()=>{
  const {client,calls}=fixture();
  const cache=createFinanceLinkCache(client,session,permissions,'all');
  const load=ids=>loadFinancePaymentLinks(client,session,permissions,'all',ids,undefined,undefined,cache);
  await load([1,2]);
  assert.deepEqual((await load([2,1])).map(r=>r.id),[2,1]);
  assert.equal(calls.length,1);
  await load([1,2,3]);
  assert.deepEqual(calls.at(-1).ids,[3]);
});

test('cache is isolated by user, client and fresh report snapshot; denied reads still reject',async()=>{
  const {client,calls}=fixture();
  const cache=createFinanceLinkCache(client,session,permissions,'all');
  await loadFinancePaymentLinks(client,session,permissions,'all',[1],undefined,undefined,cache);
  await loadFinancePaymentLinks(client,{user:{id:'other'}},permissions,'all',[1],undefined,undefined,cache);
  assert.equal(calls.length,2);
  const other=fixture();
  await loadFinancePaymentLinks(other.client,session,permissions,'all',[1],undefined,undefined,cache);
  assert.equal(other.calls.length,1);
  await loadFinancePaymentLinks(client,session,permissions,'all',[1],undefined,undefined,createFinanceLinkCache(client,session,permissions,'all'));
  assert.equal(calls.length,3);
  await assert.rejects(loadFinancePaymentLinks(client,session,{role:'custom'},'all',[1],undefined,undefined,cache),/access is required/);
  assert.equal(calls.length,3);
});

test('failed and cancelled loads do not commit partial records to cache',async()=>{
  for(const options of [{failAt:2},{controller:new AbortController()}]) {
    const {client}=fixture(options);
    const cache=createFinanceLinkCache(client,session,permissions,'all');
    await assert.rejects(loadFinancePaymentLinks(client,session,permissions,'all',Array.from({length:30},(_,i)=>i),options.controller?.signal,undefined,cache));
    assert.equal(cache.rows.size,0);
  }
});

test('successful absent records are cached and pre-cancelled warm loads reject',async()=>{
  const {client,calls}=fixture({cap:0});
  const cache=createFinanceLinkCache(client,session,permissions,'all');
  await loadFinancePaymentLinks(client,session,permissions,'all',[1],undefined,undefined,cache);
  assert.deepEqual(await loadFinancePaymentLinks(client,session,permissions,'all',[1],undefined,undefined,cache),[]);
  assert.equal(calls.length,1);
  const controller=new AbortController();controller.abort();
  await assert.rejects(loadFinancePaymentLinks(client,session,permissions,'all',[1],controller.signal,undefined,cache),{name:'AbortError'});
});

function fixture({cap=17,failAt,controller,delay=0}={}) {
  const calls=[];
  const activity={active:0,peak:0};
  return {calls,activity,client:{from(table){
    assert.equal(table,'payments');
    const call={};
    return {
      select(fields){call.fields=fields;return this;},
      in(field,ids){assert.equal(field,'id');call.ids=ids;return this;},
      order(field){assert.equal(field,'id');return this;},
      range(from,to){call.from=from;call.to=to;return this;},
      abortSignal(signal){call.signal=signal;return this;},
      async then(resolve){
        calls.push(call);
        activity.active++;activity.peak=Math.max(activity.peak,activity.active);
        if(delay)await new Promise(done=>setTimeout(done,delay));
        activity.active--;
        if(controller)controller.abort();
        return Promise.resolve(calls.length===failAt
          ? {error:new Error('Synthetic read failure')}
          : {data:call.ids.slice(call.from,Math.min(call.to+1,call.from+cap)).map(id=>({id}))}
        ).then(resolve);
      },
    };
  }}};
}

test('2000 records use 40 requests with at most four in flight and honest progress',async()=>{
  const {client,calls,activity}=fixture({cap:50,delay:2});
  const progress=[];
  const ids=Array.from({length:2000},(_,i)=>i+1);
  const rows=await loadFinancePaymentLinks(client,session,permissions,'all',ids,undefined,p=>progress.push(p));
  assert.deepEqual(rows.map(r=>r.id),ids);
  assert.equal(calls.length,40);
  assert.equal(activity.peak,4);
  assert.deepEqual(progress[0],{completed:0,total:2000});
  assert.deepEqual(progress.at(-1),{completed:2000,total:2000});
  assert.ok(progress.every((p,i)=>!i || p.completed>progress[i-1].completed));
});

test('large linked ledger loads every ID despite a smaller server cap and deduplicates IDs',async()=>{
  const {client,calls}=fixture();
  const ids=Array.from({length:123},(_,i)=>i+1);
  const rows=await loadFinancePaymentLinks(client,session,permissions,'all',[...ids,1,2]);
  assert.deepEqual(rows.map(r=>r.id),ids);
  assert.ok(calls.every(c=>c.ids.length<=50));
  assert.ok(calls.every(c=>!c.fields.includes('*') && !c.fields.includes('email') && !c.fields.includes('metadata')));
  assert.ok(calls.some(c=>c.from===17));
});

test('failure after the first page rejects the ledger instead of returning incomplete results',async()=>{
  const {client}=fixture({failAt:2});
  await assert.rejects(loadFinancePaymentLinks(client,session,permissions,'all',Array.from({length:30},(_,i)=>i)),/Synthetic read failure/);
});

test('cancelling a linked ledger prevents additional requests',async()=>{
  const controller=new AbortController();
  const {client,calls}=fixture({controller});
  await assert.rejects(loadFinancePaymentLinks(client,session,permissions,'all',[1,2,3],controller.signal),{name:'AbortError'});
  assert.equal(calls.length,1);
  assert.equal(calls[0].signal.aborted,true);
});

test('already-cancelled loads and denied contexts make no linked queries',async()=>{
  const {client,calls}=fixture();
  const controller=new AbortController();controller.abort();
  await assert.rejects(loadFinancePaymentLinks(client,session,permissions,'all',[1],controller.signal),{name:'AbortError'});
  for(const scope of ['org:1','club:1','event:1']) {
    await assert.rejects(loadFinancePaymentLinks(client,session,permissions,scope,[1]),/access is required/);
  }
  assert.equal(calls.length,0);
});
