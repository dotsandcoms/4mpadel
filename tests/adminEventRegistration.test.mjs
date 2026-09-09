import test from 'node:test';
import assert from 'node:assert/strict';
import { createPendingRegistrations } from '../src/utils/adminEventRegistration.js';

function mockClient(rows = [], insertError = null) {
    const writes = [];
    return {
        writes,
        from() {
            return {
                select() { return { eq() { return { async eq() { return { data: rows }; } }; } }; },
                update(values) { return { async eq(_, id) { writes.push({ update: values, id }); return {}; } }; },
                insert(values) {
                    writes.push({ insert: values });
                    return { async select() { return { data: insertError ? null : values.map((_, i) => ({ id: i + 1 })), error: insertError }; } };
                },
            };
        },
    };
}
const team = [
    { event_id: 1, division: 'Open', email: ' A@example.com ', full_name: 'A', partner_email: 'b@example.com', partner_payment_status: 'pending' },
    { event_id: 1, division: 'Open', email: 'b@example.com', full_name: 'B', partner_email: 'a@example.com', partner_payment_status: 'pending' },
];

test('creates both teammates together with separate pending payments', async () => {
    const client = mockClient();
    const result = await createPendingRegistrations(client, team);
    assert.equal(result.data.length, 2);
    assert.equal(client.writes.length, 1);
    const rows = client.writes[0].insert;
    assert.equal(rows.length, 2);
    assert.equal(rows[0].email, rows[1].partner_email);
    assert.equal(rows[1].email, rows[0].partner_email);
    assert.ok(rows.every((r) => r.payment_status === 'pending' && r.payment_method === null && r.status === 'registered'));
});

test('rejects the same teammate twice before writing', async () => {
    const client = mockClient();
    await assert.rejects(createPendingRegistrations(client, [team[0], { ...team[1], email: 'a@EXAMPLE.com' }]), /different teammates/);
    assert.equal(client.writes.length, 0);
});

for (const field of ['email', 'partner_email']) {
    test(`rejects existing ${field} before adding either player or archiving`, async () => {
        const client = mockClient([{ id: 4, email: team[0].email, status: 'withdrawn' }, { id: 5, [field]: 'B@example.com', status: 'registered' }]);
        await assert.rejects(createPendingRegistrations(client, team), /already entered/);
        assert.equal(client.writes.length, 0);
    });
}

test('releases withdrawn slots and then inserts the complete team', async () => {
    const client = mockClient([{ id: 4, email: 'a@example.com', status: 'withdrawn' }]);
    const result = await createPendingRegistrations(client, team);
    assert.equal(result.replacedWithdrawn, true);
    assert.deepEqual(client.writes[0], { update: { division: '__archived__/4', division_id: null }, id: 4 });
    assert.equal(client.writes[1].insert.length, 2);
});

test('surfaces a competing registration conflict without retrying individual players', async () => {
    const client = mockClient([], { code: '23505' });
    await assert.rejects(createPendingRegistrations(client, team), /already entered/);
    assert.equal(client.writes.length, 1);
});

test('preserves single-player registration', async () => {
    const client = mockClient();
    const result = await createPendingRegistrations(client, [{ ...team[0], partner_email: null, partner_payment_status: null }]);
    assert.equal(result.data.length, 1);
    assert.equal(client.writes[0].insert[0].partner_email, null);
});
