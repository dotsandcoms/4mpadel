import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activeEventEntries, registrationWindow } from '../../src/pages/admin-preview/eventManagerData.js';
test('entry counts exclude withdrawals and prefer paid duplicates without merging events', () => {
  const rows = [{id:1,event_id:1,email:' A@EXAMPLE.COM ',division:'Open'},
    {id:2,event_id:1,email:'a@example.com',division:'Open',payment_status:'paid'},
    {id:3,event_id:2,email:'a@example.com',division:'Open'},
    {id:4,event_id:1,email:'a@example.com',division:'Mixed'},
    {id:5,event_id:1,email:'b@example.com',status:'withdrawn'},
    {id:6,event_id:1}];
  assert.deepEqual(activeEventEntries(rows).map(row=>row.id), [2,3,4,6]);
});
test('registration windows do not infer enabled registration from dates', () => {
  const now = Date.parse('2026-09-04T12:00:00Z');
  assert.equal(registrationWindow({},now).label, 'Check event settings');
  assert.equal(registrationWindow({registration_closes_at:'2026-09-03'},now).label,'Closed');
  assert.equal(registrationWindow({registration_opens_at:'2026-09-05'},now).label,'Not yet open');
});
