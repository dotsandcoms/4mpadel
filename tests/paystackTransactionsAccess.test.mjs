import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canReadPaystackTransactions } from '../supabase/functions/paystack-transactions/access.mjs';

const user = { id: 'verified-actor', email: 'allowed_operator@example.invalid' };
const explicitGrant = {
    email: user.email.toUpperCase(),
    allowed_tabs: ['finance'],
    module_permissions: { finance: { allowedTabs: ['transactions'], allowedEvents: [] } },
};

function clients({ active = true, superAdmin = false, permission = explicitGrant, memberships = {}, unavailable } = {}) {
    const calls = [];
    const caller = { async rpc(name, args) {
        calls.push([name, args]);
        return { data: name === 'account_is_active' ? active : superAdmin, error: unavailable === name ? new Error('offline') : null };
    } };
    const service = { from(table) {
        calls.push([table]);
        return {
            select() { return this; },
            eq(column, filter) { calls.push([column, filter]); return this; },
            ilike(column, filter) { calls.push([column, filter]); return this; },
            async maybeSingle() { return { data: permission, error: unavailable === table ? new Error('offline') : null }; },
            async limit() { return { data: memberships[table] || [], error: unavailable === table ? new Error('offline') : null }; },
        };
    } };
    return { caller, service, calls };
}

test('verified platform admin can read the gateway without a delegated grant', async () => {
    const { caller, service, calls } = clients({ superAdmin: true });
    assert.equal(await canReadPaystackTransactions(caller, service, user), true);
    assert.deepEqual(calls, [
        ['account_is_active', undefined],
        ['is_super_admin', { user_email: user.email }],
    ]);
});

test('legacy standalone Finance Transactions grant needs explicit unscoped access', async () => {
    const { caller, service, calls } = clients();
    assert.equal(await canReadPaystackTransactions(caller, service, user), true);
    assert.ok(calls.some(([column, pattern]) => column === 'email' && pattern === 'allowed\\_operator@example.invalid'));

    const deniedGrants = [
        { ...explicitGrant, allowed_tabs: ['event-mgmt'] },
        { ...explicitGrant, module_permissions: { finance: { allowedTabs: ['summary'] } } },
        { ...explicitGrant, module_permissions: { finance: { allowedTabs: ['transactions'], allowedEvents: [104] } } },
        { ...explicitGrant, module_permissions: { ...explicitGrant.module_permissions, 'event-mgmt': { allowedEvents: [104] } } },
        { ...explicitGrant, email: 'unrelated@example.invalid' },
        null,
    ];
    for (const permission of deniedGrants) {
        const denied = clients({ permission });
        assert.equal(await canReadPaystackTransactions(denied.caller, denied.service, user), false);
    }
});

test('organisation, club and federation members cannot read a standalone global grant', async () => {
    for (const table of ['organisation_members', 'club_members', 'federation_members']) {
        const denied = clients({ memberships: { [table]: [{ user_email: user.email }] } });
        assert.equal(await canReadPaystackTransactions(denied.caller, denied.service, user), false, table);
    }
});

test('legacy owner of an approved organisation cannot read the platform gateway', async () => {
    const standalone = clients({ memberships: { players: [{ id: 17 }] } });
    assert.equal(await canReadPaystackTransactions(standalone.caller, standalone.service, user), true);
    assert.ok(standalone.calls.some(([column, value]) => column === 'created_by' && value === 17));

    const owner = clients({ memberships: { players: [{ id: 17 }], organisations: [{ id: 'legacy-org' }] } });
    assert.equal(await canReadPaystackTransactions(owner.caller, owner.service, user), false);
});

test('gateway access fails closed for missing, inactive or unresolved actors', async () => {
    const unauthenticated = clients();
    assert.equal(await canReadPaystackTransactions(unauthenticated.caller, unauthenticated.service, {}), false);
    assert.deepEqual(unauthenticated.calls, []);

    for (const options of [
        { active: false, superAdmin: true },
        { unavailable: 'account_is_active', superAdmin: true },
        { unavailable: 'is_super_admin', superAdmin: true },
        { unavailable: 'admin_sidebar_permissions' },
        { unavailable: 'organisation_members' },
        { unavailable: 'players' },
        { unavailable: 'organisations', memberships: { players: [{ id: 17 }] } },
    ]) {
        const denied = clients(options);
        assert.equal(await canReadPaystackTransactions(denied.caller, denied.service, user), false);
    }
});
