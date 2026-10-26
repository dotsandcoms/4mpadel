import test from 'node:test';
import assert from 'node:assert/strict';
import { loadGatewayLinks } from '../../src/pages/admin-preview/gatewayLinks.js';
const session={user:{id:'qa'}},permissions={role:'super_admin'};
function client(records,error=null){const calls=[];return {calls,from(table){calls.push(table);let start=0;return {select(){return this;},eq(...args){calls.push(args);return this;},in(...args){calls.push(args);return this;},order(){return this;},abortSignal(){return this;},range(a){start=a;return this;},then(resolve){return Promise.resolve({data:records.slice(start,start+2),error}).then(resolve);}};}};}
const transactions=['A','B','C','D'].map(reference=>({reference,environment:'test'}));
const record=(reference,id)=>({reference,id,is_test:true,payment_method:'paystack',players:{name:'Synthetic player'},calendar:{event_name:'Synthetic event'}});
test('exact same-environment references expose names, duplicates and nonmatches stay explicit',async()=>{
 const c=client([record('A',1),record('B',2),record('B',3),{...record('D',4),is_test:false}]);
 const rows=await loadGatewayLinks(c,session,permissions,'all',transactions);
 assert.deepEqual(rows.map(r=>r.link.state),['matched','ambiguous','unmatched','unmatched']);
 assert.equal(rows[0].link.playerName,'Synthetic player');
 assert.equal(rows[1].link.playerName,undefined);
 assert.ok(c.calls.some(x=>Array.isArray(x)&&x[0]==='is_test'&&x[1]===true));
});
test('lookup errors are not reported as missing payments; unauthorized and cancelled do not query',async()=>{
 const rows=await loadGatewayLinks(client([],new Error('query failed')),session,permissions,'all',transactions);
 assert.ok(rows.every(r=>r.link.state==='unavailable'));
 const c=client([]);
 await assert.rejects(loadGatewayLinks(c,session,permissions,'club',transactions));
 await assert.rejects(loadGatewayLinks(c,session,permissions,'all',transactions,AbortSignal.abort()));
 assert.equal(c.calls.length,0);
});
