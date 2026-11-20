import assert from 'node:assert/strict';
import test from 'node:test';
import { canOpenOrganisationHostEvents, loadOrganisationHosts, loadOrganisationHostEditor, verifyOrganisationHostBuilder,
  verifyOrganisationHostEdit } from '../src/pages/admin-preview/organisationHostEvents.js';

const host = { id: 'host', name: 'Approved host', status: 'approved' };
const event = { id: 11, event_name: 'Own event', organisation_id: host.id, is_manual: true, is_quick_event: false, club_id: null, event_status: 'active' };
const division = { id: 'own-division', event_id: 11 };
const operation = { actorId: 'owner', organisationId: host.id, scopeId: 'org:host', isCurrent: () => true };
const fixture = ({ account = 'owner', approved = true, platform = false, denied = false, eventRows = [event] } = {}) => {
  const logs = [];
  return {
    logs,
    auth: { getUser: async () => ({ data: { user: { id: account } } }) },
    rpc: async (name, args) => {
      logs.push([name, args]);
      if (denied) return { error: new Error('Membership was revoked.') };
      return { data: { organisation: { ...host, status: approved ? 'approved' : 'pending' }, event_id: args.p_event_id ?? null, platform, clubs: [] } };
    },
    from(table) {
      let rows = table === 'calendar' ? eventRows : [division];
      let bounds;
      const query = {
        select() { return query; },
        eq(key, value) { logs.push([table, key, value]); rows = rows.filter(row => row[key] === value); return query; },
        order() { return query; },
        abortSignal() { return query; },
        range(first, last) { bounds = [first, last]; return query; },
        then(resolve) { return Promise.resolve({ data: bounds ? rows.slice(bounds[0], bounds[1] + 1) : rows }).then(resolve); },
        single() { return Promise.resolve({ data: rows[0] }); },
      };
      return query;
    },
  };
};

test('host workspaces require matching approved organisation and a current direct owner or admin', async () => {
  const ui = { scopeId: 'org:host', userId: 'owner', editableIds: ['host'] };
  assert.equal(canOpenOrganisationHostEvents(host, ui), true);
  assert.equal(canOpenOrganisationHostEvents(host, { ...ui, editableIds: [] }), false);
  assert.equal(canOpenOrganisationHostEvents({ ...host, status: 'pending' }, ui), false);
  assert.equal(canOpenOrganisationHostEvents(host, { ...ui, scopeId: 'org:foreign' }), false);
  assert.equal(canOpenOrganisationHostEvents(host, { ...ui, scopeId: 'all' }), false);
  assert.equal(canOpenOrganisationHostEvents(host, { ...ui, scopeId: 'all', superAdmin: true }), true);
  await assert.rejects(verifyOrganisationHostBuilder({ ...operation, client: fixture({ account: 'other' }) }), /signed-in account changed/);
  await assert.rejects(verifyOrganisationHostBuilder({ ...operation, client: fixture({ denied: true }) }), /revoked/);
  await assert.rejects(verifyOrganisationHostBuilder({ ...operation, client: fixture({ approved: false }) }), /could not be verified/);
  await assert.rejects(verifyOrganisationHostBuilder({ ...operation, client: fixture(), scopeId: 'all' }), /could not be verified/);
});

test('host list and existing editor scope every Calendar query to the selected organisation', async () => {
  const client = fixture({ eventRows: [event, { ...event, id: 12, organisation_id: 'foreign' }] });
  const result = await loadOrganisationHosts({ ...operation, client, signal: new AbortController().signal });
  assert.deepEqual(result.events.map(row => row.id), [11]);
  const { snapshot } = await loadOrganisationHostEditor({ ...operation, client, event });
  assert.equal(snapshot.event.id, 11);
  assert.deepEqual(snapshot.divisions, [division]);
  assert.deepEqual(client.logs.filter(([table, key]) => table === 'calendar' && key === 'organisation_id'),
    [['calendar', 'organisation_id', 'host'], ['calendar', 'organisation_id', 'host'], ['calendar', 'organisation_id', 'host']]);
  const count = client.logs.length;
  await assert.rejects(loadOrganisationHostEditor({ ...operation, client, event: { ...event, organisation_id: 'foreign' } }), /owned by the selected organisation/);
  assert.equal(client.logs.length, count);
});

test('host editing checks exact venue, preserved ownership, latest division set and independent sanctioning', async () => {
  const client = fixture();
  const { snapshot } = await loadOrganisationHostEditor({ ...operation, client, event });
  const context = { operation: 'save', event, payload: { organisation_id: 'host', venues: ['Home'], venue: 'Home', federation_sanction_status: 'pending' } };
  await verifyOrganisationHostEdit({ ...operation, client, snapshot, context });
  assert.deepEqual(client.logs.filter(([name]) => name === 'admin_organisation_host_builder').at(-1)[1],
    { p_organisation_id: 'host', p_event_id: 11, p_venues: ['Home'], p_club_id: null });
  await assert.rejects(verifyOrganisationHostEdit({ ...operation, client, snapshot, context: { ...context, removedDivisionIds: ['foreign'] } }), /outside this event/);
  await assert.rejects(verifyOrganisationHostEdit({ ...operation, client, snapshot, context: { ...context, payload: { ...context.payload, club_id: 'new' } } }), /change the linked club/);
  await assert.rejects(verifyOrganisationHostEdit({ ...operation, client, snapshot, context: { ...context, payload: { ...context.payload, organisation_id: 'foreign' } } }), /must remain/);
  await assert.rejects(verifyOrganisationHostEdit({ ...operation, client, snapshot, context: { ...context, payload: { ...context.payload, federation_sanction_status: 'approved' } } }), /federation must approve/);
  await assert.rejects(verifyOrganisationHostEdit({ ...operation, client: fixture({ eventRows: [{ ...event, event_name:'Changed by another admin' }] }), snapshot, context }), /changed/);
  await assert.rejects(verifyOrganisationHostEdit({ ...operation, client, snapshot, context: { ...context, operation: 'upload-sponsor', payload: null } }), /Only cover uploads/);
});
