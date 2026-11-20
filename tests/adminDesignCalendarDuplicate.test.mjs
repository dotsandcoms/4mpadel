import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canDuplicateCalendarEvent, loadCalendarDuplicateReview, prepareCalendarDuplicate, saveCalendarDuplicate } from '../src/pages/admin-preview/calendarDuplicate.js';
import { publicEventUrl } from '../src/pages/admin-preview/calendarData.js';

const event = { id:11, event_name:'Fixture Cup', slug:'fixture cup', is_manual:true, organisation_id:'org-a', club_id:'club-a' };
const fingerprint = 'a'.repeat(32);
const snapshot = { source_id:11, event_name:'Fixture Cup', organisation_id:'org-a', club_id:'club-a', fingerprint, division_count:2 };
const form = { title:' Fixture Cup (copy) ', start:'2035-01-31', end:'2035-02-01' };
const requestId = '4b971ae1-b8d2-4d70-a40c-470adc39d2e3';

function fixture({ denied = false, role = true, preview = snapshot, receipt = null, error = null } = {}) {
  const calls = [];
  const client = {
    auth: { async getUser() { calls.push(['auth']); return { data: { user: { id: 'user', email:'fixture@example.invalid' } } }; } },
    async rpc(name, params) {
      calls.push([name,params]);
      if (name === 'account_is_active') return { data: !denied };
      if (name === 'is_super_admin') return { data: role };
      if (params.p_request_id) return { data: receipt || { id:15, event_name:'Fixture Cup (copy)', division_count:2, created:true }, error };
      return { data: preview };
    },
  };
  return { calls, context: { client, event, expectedUserId: 'user', scopeId: 'all', isCurrent: () => true } };
}

test('Calendar copy validates names, real dates and local module access before review', () => {
  assert.deepEqual(prepareCalendarDuplicate(form), { title:'Fixture Cup (copy)', start:'2035-01-31', end:'2035-02-01' });
  assert.throws(() => prepareCalendarDuplicate({ ...form, start:'2035-02-30' }), /valid event dates/);
  assert.throws(() => prepareCalendarDuplicate({ ...form, end:'2035-01-30' }), /valid event dates/);
  assert.throws(() => prepareCalendarDuplicate({ ...form, title:'   ' }), /Enter a name/);
  assert.equal(canDuplicateCalendarEvent(event, false), false);
  assert.equal(canDuplicateCalendarEvent({ ...event, is_manual:false }, true), false);
  assert.equal(canDuplicateCalendarEvent({ ...event, id:'demo-22' }, true), false);
});

test('Calendar review performs an authenticated read and rejects a changed organisation or tenant scope', async () => {
  const allowed = fixture();
  assert.deepEqual(await loadCalendarDuplicateReview(allowed.context), snapshot);
  assert.deepEqual(allowed.calls.at(-1), ['admin_duplicate_calendar_event', { p_source_id:11 }]);
  const foreign = fixture({ preview: { ...snapshot, organisation_id:'org-b' } });
  await assert.rejects(loadCalendarDuplicateReview(foreign.context), /selected event changed/);
  const tenant = fixture();
  await assert.rejects(loadCalendarDuplicateReview({ ...tenant.context, scopeId:'org:org-a' }), /all-workspaces/);
  assert.deepEqual(tenant.calls, []);
  const nonAdmin = fixture({ role:false });
  await assert.rejects(loadCalendarDuplicateReview(nonAdmin.context), /verified super-admin/);
  assert.equal(nonAdmin.calls.some(([name]) => name === 'admin_duplicate_calendar_event'), false);
});

test('Calendar confirmation pins reviewed identity, dates, scope and request id, and checks the copy receipt', async () => {
  const allowed = fixture();
  let attempts = 0;
  const result = await saveCalendarDuplicate({ ...allowed.context, review:snapshot, form, requestId, onAttempt:() => attempts++ });
  assert.equal(attempts, 1);
  assert.equal(result.id, 15);
  assert.deepEqual(allowed.calls.at(-1), ['admin_duplicate_calendar_event', {
    p_source_id:11, p_expected_fingerprint:fingerprint, p_title:'Fixture Cup (copy)', p_start:'2035-01-31', p_end:'2035-02-01', p_request_id:requestId,
  }]);
  const stale = fixture({ error: new Error('The source event or divisions changed') });
  await assert.rejects(saveCalendarDuplicate({ ...stale.context, review:snapshot, form, requestId, onAttempt() {} }), /source event or divisions changed/);
  const misdirected = fixture({ receipt: { id:11, event_name:'Fixture Cup (copy)', division_count:2, created:true } });
  await assert.rejects(saveCalendarDuplicate({ ...misdirected.context, review:snapshot, form, requestId, onAttempt() {} }), /Could not verify/);
  const changedScope = fixture();
  await assert.rejects(saveCalendarDuplicate({ ...changedScope.context, scopeId:'org:org-a', review:snapshot, form, requestId, onAttempt() {} }), /all-workspaces/);
  assert.deepEqual(changedScope.calls, []);
});

test('Calendar public links target the canonical public site by the registered slug', () => {
  assert.equal(publicEventUrl(event), 'https://4mpadel.co.za/calendar/fixture%20cup');
  assert.equal(publicEventUrl({ ...event, slug:'' }), null);
});
