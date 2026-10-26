import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addProvisionalEntries } from '../../src/utils/provisionalEntry.js';
function fixture() {
  const writes=[], emails=[], logs=[];
  return {writes,emails,logs,args:{client:{from(){return {insert(rows){writes.push(rows);return {select:async()=>({data:rows.map((row,id)=>({id,email:row.email})),error:null})};}};}},event:{id:1,event_name:'Test'},division:{id:2,name:'Open',entry_fee:500},players:[{name:'A',email:'a@test'},{name:'B',email:'b@test'}],registrations:[],adminEmail:'admin@test',note:'Club',sendEmail:async(...args)=>{emails.push(args);return {success:true};},logEventActivity:async row=>{logs.push(row);return 1;}}};
}
test('team insert is one request with reciprocal pending partners',async()=>{const f=fixture();await addProvisionalEntries(f.args);assert.equal(f.writes.length,1);assert.equal(f.writes[0].length,2);assert.equal(f.writes[0][0].partner_email,'b@test');assert.equal(f.writes[0][1].partner_email,'a@test');assert(f.writes[0].every(row=>row.payment_status==='pending'));assert.equal(f.emails.length,2);assert.equal(f.logs.length,2);});
test('existing active and duplicate player entries are rejected before writes',async()=>{const f=fixture();f.args.registrations=[{email:'A@test',division:'Open',status:'registered'}];await assert.rejects(addProvisionalEntries(f.args));assert.equal(f.writes.length,0);f.args.registrations=[];f.args.players[1]=f.args.players[0];await assert.rejects(addProvisionalEntries(f.args));assert.equal(f.writes.length,0);});
test('email failure returns saved registrations with warning',async()=>{const f=fixture();f.args.sendEmail=async()=>({success:false});const result=await addProvisionalEntries(f.args);assert.equal(result.registrations.length,2);assert.equal(result.warnings.length,2);assert.equal(f.writes.length,1);});
test('single entry preserves legacy fields without partner',async()=>{const f=fixture();f.args.players=f.args.players.slice(0,1);await addProvisionalEntries(f.args);assert.equal(f.writes[0][0].partner_email,undefined);assert.equal(f.writes[0][0].registered_by,'admin@test');});
