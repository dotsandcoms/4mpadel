import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyHostedReviewAccess } from '../src/pages/admin-preview/hostedReviewAccess.js';
import { canOpenReviewPage, previewScopes, restrictPreviewEvents } from '../src/pages/admin-preview/access.js';

const actor = { id: 'fixture-actor', email: 'owner_a@fixture.invalid' };
const other = { id: 'fixture-other', email: 'owner-b@fixture.invalid' };

function clientFixture({ tables = {}, superAdmin = false, active = true, tournaments = [], identities = [actor, actor, actor] } = {}) {
  const calls = [];
  const userQueue = [...identities];
  const client = {
    auth: { getUser: async () => ({ data: { user: userQueue.shift() } }) },
    rpc: async (name, args) => {
      calls.push([name, args]);
      return { data: name === 'account_is_active' ? active : name === 'tm_list_events' ? tournaments : superAdmin };
    },
    from: table => {
      const rows = tables[table] || [];
      const builder = {
        select: () => builder,
        eq: (column, value) => { calls.push([table, 'eq', column, value]); return builder; },
        ilike: (column, value) => { calls.push([table, 'ilike', column, value]); return builder; },
        order: () => builder,
        maybeSingle: async () => ({ data: rows[0] || null }),
        then: resolve => Promise.resolve({ data: rows }).then(resolve),
      };
      return builder;
    },
  };
  return { client, calls };
}

const organisation = (id, name, status = 'approved') => ({ id, name, status });
const membership = (org, role = 'owner', email = actor.email) => ({ user_email: email, role, organisations: org });

test('verified organisation admin can open their own operations, never account-wide finance or licences', async () => {
  const north = organisation('north', 'North Court');
  const south = organisation('south', 'South Court');
  const { client, calls } = clientFixture({ tables: {
    organisation_members: [membership(north), membership(south, 'owner', other.email), membership(organisation('pending', 'Pending', 'pending'))],
    admin_sidebar_permissions: [{ email: actor.email, role: 'custom', allowed_tabs: ['finance', 'licenses', 'players', 'event-mgmt'], module_permissions: { finance: { allowedTabs: ['transactions'] } } }],
  } });
  const access = await verifyHostedReviewAccess(client, actor);
  assert.equal(access.user.id, actor.id);
  assert.deepEqual(access.permissions.orgs.map(row => row.id), ['north']);
  assert.deepEqual(calls.find(([name]) => name === 'is_super_admin'), ['is_super_admin', { user_email: actor.email }]);
  assert.deepEqual(calls.find(([name]) => name === 'organisation_members'), ['organisation_members', 'ilike', 'user_email', 'owner\\_a@fixture.invalid']);
  for (const page of ['events', 'calendar', 'reports', 'payouts', 'organisations', 'messaging', 'help', 'security']) assert.equal(canOpenReviewPage(access.permissions, page), true, page);
  for (const page of ['home', 'licenses', 'players', 'payments', 'team-access']) assert.equal(canOpenReviewPage(access.permissions, page), false, page);
  for (const page of ['events', 'reports', 'organisations', 'payouts']) assert.deepEqual(previewScopes(access.permissions, page).map(scope => scope.id), ['org:north']);
});

test('staff and separately assigned event managers receive distinct navigation', async () => {
  const { client: staffClient } = clientFixture({ tables: { organisation_members: [membership(organisation('north', 'North Court'), 'staff')] } });
  const { permissions: staff } = await verifyHostedReviewAccess(staffClient, actor);
  assert.equal(canOpenReviewPage(staff, 'organisations'), true);
  for (const page of ['events', 'reports', 'payouts', 'messaging', 'licenses']) assert.equal(canOpenReviewPage(staff, page), false, page);
  const { client: assignedClient } = clientFixture({ tables: {
    admin_sidebar_permissions: [{ email: actor.email, role: 'custom', allowed_tabs: [], module_permissions: { 'event-mgmt': { allowedEvents: [42] } } }],
  } });
  const { permissions: assigned } = await verifyHostedReviewAccess(assignedClient, actor);
  assert.deepEqual(assigned.module_permissions['event-mgmt'].allowedEvents, [42]);
  assert.equal(canOpenReviewPage(assigned, 'events'), true);
  assert.equal(canOpenReviewPage(assigned, 'payouts'), false);
  assert.equal(canOpenReviewPage(assigned, 'licenses'), false);
});

test('ordinary accounts, inactive actors, mismatched identities and false elevated grants fail closed', async () => {
  await assert.rejects(verifyHostedReviewAccess(clientFixture().client, actor), /no Admin workspaces/);
  await assert.rejects(verifyHostedReviewAccess(clientFixture({ active: false }).client, actor), /active 4M account/);
  await assert.rejects(verifyHostedReviewAccess(clientFixture({ superAdmin: true, identities: [actor, other] }).client, actor), /changed during verification/);
  const { client } = clientFixture({ tables: { admin_sidebar_permissions: [{ email: actor.email, role: 'super_admin', allowed_tabs: ['settings'] }] } });
  await assert.rejects(verifyHostedReviewAccess(client, actor), /no Admin workspaces/);
});

test('server-verified platform admin keeps full operational navigation', async () => {
  const { permissions } = await verifyHostedReviewAccess(clientFixture({ superAdmin: true }).client, actor);
  assert.equal(permissions.role, 'super_admin');
  for (const page of ['events', 'help', 'messaging', 'security', 'payments', 'reports', 'payouts', 'licenses', 'team-access']) assert.equal(canOpenReviewPage(permissions, page), true, page);
  assert.deepEqual(previewScopes(permissions, 'reports').map(scope => scope.id), ['all']);
});

test('direct event and registration routes bind to both membership and explicit assignments', () => {
  const permissions = {
    role: 'custom', allowed_tabs: ['event-mgmt'],
    orgs: [{ id: 'north', name: 'North Court', member_role: 'owner' }],
    module_permissions: { 'event-mgmt': { allowedEvents: [42] } },
  };
  const scoped = previewScopes(permissions, 'event');
  assert.deepEqual(scoped.map(scope => scope.id), ['org:north']);
  assert.equal(canOpenReviewPage(permissions, 'event'), true);
  assert.equal(canOpenReviewPage(permissions, 'payment'), true);
  assert.equal(canOpenReviewPage(permissions, 'player'), false);
  const filters = [];
  const query = {
    eq: (field, value) => { filters.push(['eq', field, value]); return query; },
    in: (field, value) => { filters.push(['in', field, value]); return query; },
  };
  restrictPreviewEvents(query, permissions, scoped[0]);
  assert.deepEqual(filters, [['in', 'id', [42]], ['eq', 'organisation_id', 'north']]);
  assert.throws(() => restrictPreviewEvents(query, permissions, { id: 'org:south' }), /access is required/);
});

test('a standalone Finance grant requires explicit unscoped access to Paystack', () => {
  const allowed = { role: 'custom', allowed_tabs: ['finance'],
    module_permissions: { finance: { allowedTabs: ['transactions'] } } };
  assert.equal(canOpenReviewPage(allowed, 'payments'), true);
  assert.equal(canOpenReviewPage({ ...allowed, orgs: [{ id: 'north', member_role: 'staff' }] }, 'payments'), false);
  const eventOnly = { ...allowed, module_permissions: { finance: { allowedTabs: ['transactions'], allowedEvents: [42] } } };
  assert.equal(canOpenReviewPage(eventOnly, 'payments'), false);
  assert.equal(canOpenReviewPage(eventOnly, 'reports'), true);
});

test('tournament rights come from the tournament capability RPC', async () => {
  const { permissions } = await verifyHostedReviewAccess(clientFixture({ tournaments: [{ id: 42 }] }).client, actor);
  assert.equal(canOpenReviewPage(permissions, 'tournaments'), true);
  assert.equal(canOpenReviewPage(permissions, 'events'), false);
  assert.deepEqual(permissions.tournamentAssignments.map(event => event.id), [42]);
});
