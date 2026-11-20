import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const origin = 'https://supabase.fixture.invalid';
const sourceEntry = {
  id: 'source-registration', event_id: 101, email: 'owner@example.invalid', registered_by: 'owner@example.invalid',
  full_name: 'Booking Owner', division: 'Open', division_id: 'open-101', status: 'registered', payment_status: 'pending',
};
const partnerEntry = {
  ...sourceEntry, id: 'partner-registration', email: 'partner_%@example.invalid', full_name: 'Paired Player',
  partner_email: sourceEntry.email,
};
const foreignEntry = {
  ...sourceEntry, id: 'foreign-registration', event_id: 202, email: 'foreign@example.invalid',
  registered_by: 'foreign@example.invalid', division_id: 'open-202',
};

async function compileHandler(url) {
  const result = await build({
    entryPoints: [new URL(url, import.meta.url).pathname], bundle: true, write: false, platform: 'neutral',
    plugins: [{ name: 'mocked-hosted-boundaries', setup(plugin) {
      plugin.onResolve({ filter: /^https:\/\// }, ({ path }) => ({ path, namespace: 'fixture' }));
      plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => {
        if (path.startsWith('https://esm.sh/@supabase/supabase-js@')) return { contents: 'export const createClient = fixtureClient;' };
        if (path.startsWith('https://deno.land/std@') && path.endsWith('/http/server.ts')) return { contents: 'export const serve = fixtureServe;' };
        throw new Error('Unexpected import: ' + path);
      });
    } }],
  });
  return new Function('Deno', 'fetch', 'fixtureClient', 'fixtureServe', 'console', result.outputFiles[0].text);
}

function fixture(evaluate, { email = sourceEntry.email, platform = false, eventGrants = [], active = true,
  entries = [{ ...sourceEntry, partner_email: partnerEntry.email }, partnerEntry, foreignEntry], closed = false, payments = [] } = {}) {
  const calls = [];
  const tables = {
    calendar: [101, 202].map(id => ({ id, is_manual: true, title: 'Fixture cup',
      registration_closes_at: closed ? '2000-01-01T00:00:00Z' : null, slug: 'fixture' })),
    event_registrations: structuredClone(entries),
    tournament_divisions: [101, 202].flatMap(event => [
      { id: `open-${event}`, event_id: event, name: 'Open', entry_fee: 300, is_active: true, cancelled_at: null },
      { id: `other-${event}`, event_id: event, name: 'Target', entry_fee: 400, is_active: true },
    ]),
    payments: structuredClone(payments), payment_refunds: [], player_schedule_events: [],
  };

  const auth = {
    auth: { getUser: async () => ({ data: { user: { id: 'actor-fixture', email } } }) },
    async rpc(name, args) {
      calls.push(['auth', name, args]);
      if (name === 'account_is_active') return { data: active };
      if (name === 'is_super_admin') return { data: platform };
      if (name === 'can_manage_event') return { data: eventGrants.includes(args.p_event_id) };
      throw new Error('Unexpected identity operation ' + name);
    },
  };
  const service = {
    async rpc(name, args) {
      calls.push(['service', name, args]);
      if (name === 'review_verified_entry_switch' || name === 'move_registration_division' || name === 'reassign_tournament_participant_division') return { data: null };
      throw new Error('Unexpected service operation ' + name);
    },
    from(table) {
      assert.ok(tables[table], 'Expected a known fixture table instead of a global sidebar lookup: ' + table);
      const filters = [];
      let mutation;
      let single;
      const answer = () => {
        const rows = tables[table].filter(row => filters.every(([, , , matches]) => matches(row)));
        if (mutation) {
          calls.push(['write', table, rows.map(row => row.id), mutation[1]]);
          if (mutation[0] === 'update') rows.forEach(row => Object.assign(row, mutation[1]));
          else if (mutation[0] === 'delete') tables[table] = tables[table].filter(row => !rows.includes(row));
        }
        return { data: structuredClone(single ? rows[0] || null : rows), error: null };
      };
      const query = {
        select() { return this; },
        eq(key, value) { filters.push(['eq',key,value,row => String(row[key]) === String(value)]); return this; },
        neq(key, value) { filters.push(['neq',key,value,row => row[key] !== value]); return this; },
        is(key, value) { filters.push(['is',key,value,row => (row[key] ?? null) === value]); return this; },
        ilike(key, pattern) {
          const value = pattern.replace(/\\([\\%_])/g, '$1');
          calls.push(['literal', table, key, pattern]);
          filters.push(['ilike',key,pattern,row => String(row[key] || '').toLowerCase() === value]);
          return this;
        },
        in(key, values) { filters.push(['in',key,values,row => values.includes(row[key])]); return this; },
        update(values) { mutation = ['update', values]; return this; },
        delete() { mutation = ['delete']; return this; },
        maybeSingle() { single = true; return this; },
        then(resolve, reject) { return Promise.resolve().then(answer).then(resolve, reject); },
      };
      return query;
    },
  };
  const env = { SUPABASE_URL: origin, SUPABASE_ANON_KEY: 'fixture-anon', SUPABASE_SERVICE_ROLE_KEY: 'fixture-service' };
  let handler;
  evaluate({ env: { get: key => env[key] } }, async (url, init) => {
    assert.equal(url, origin + '/functions/v1/send-email', 'Fixtures never call Paystack or external services');
    calls.push(['synthetic-email', JSON.parse(init.body)?.to]);
    return Response.json({ sent: true });
  }, (_url, key) => key === env.SUPABASE_SERVICE_ROLE_KEY ? service : auth, fn => { handler = fn; },
  { log() {}, warn() {}, error() {} });
  const send = (payload, token = 'fixture-active-token') => handler(new Request(origin + '/functions/v1/paystack-refund', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: JSON.stringify(payload),
  }));
  return { send, calls, tables };
}

const versions = [
  ['web', await compileHandler('../supabase/functions/paystack-refund/index.ts')],
  ['mobile', await compileHandler('../mobile/supabase/functions/paystack-refund/index.ts')],
];

for (const [version, evaluate] of versions) {
  test(version + ' exact event grants control every privileged cancellation, removal and switch branch', async () => {
    for (const input of [
      { action: 'cancel_event', event_id: 202 },
      { action: 'cancel_division', event_id: 202, division_id: 'open-202' },
      { action: 'admin_remove', registration_id: foreignEntry.id, no_refund: true, skip_paystack: true },
      { action: 'remove_partner', registration_id: foreignEntry.id },
      { action: 'switch_division', registration_id: foreignEntry.id, target_division_id: 'other-202' },
      { action: 'switch_division_quote', registration_id: foreignEntry.id, target_division_id: 'other-202' },
    ]) {
      const { send, calls } = fixture(evaluate, { email: 'finance-custom@example.invalid', eventGrants: [101] });
      assert.equal((await send(input)).status, 403);
      assert.deepEqual(calls.filter(call => call[0] === 'auth' && call[1] === 'can_manage_event'),
        [['auth', 'can_manage_event', { p_event_id: 202 }]]);
      assert.equal(calls.some(call => ['write', 'service', 'synthetic-email'].includes(call[0])), false);
    }
  });

  test(version + ' event manager cancels only the saved event and platform role remains explicit', async () => {
    const local = fixture(evaluate, { email: 'assigned@example.invalid', eventGrants: [101] });
    assert.equal((await local.send({ action: 'cancel_division', event_id: '101', division_id: 'open-101' })).status, 200);
    assert.equal(local.tables.tournament_divisions.find(row => row.id === 'open-101').is_active, false);
    assert.equal(local.tables.tournament_divisions.find(row => row.id === 'open-202').is_active, true);
    assert.equal(local.tables.event_registrations.find(row => row.id === foreignEntry.id).status, 'registered');
    const platform = fixture(evaluate, { platform: true });
    assert.equal((await platform.send({ action: 'cancel_event', event_id: 202 })).status, 200);
    assert.equal(platform.tables.calendar.find(row => row.id === 202).event_status, 'cancelled');
    assert.equal(platform.tables.calendar.find(row => row.id === 101).event_status, undefined);
    assert.equal((await platform.send({ action: 'admin_remove', event_id: 101, registration_id: foreignEntry.id })).status, 404);
    assert.equal(platform.calls.some(call => call[0] === 'auth' && call[1] === 'can_manage_event'), false);
    const inactive = fixture(evaluate, { platform: true, active: false });
    assert.equal((await inactive.send({ action: 'cancel_event', event_id: 101 })).status, 403);
    assert.equal(inactive.calls.some(call => call[0] === 'write'), false);
  });

  test(version + ' keeps player self-withdrawal and exact linked partner removal', async () => {
    const player = fixture(evaluate, { email: partnerEntry.email });
    assert.equal((await player.send({ action: 'withdraw', registration_id: sourceEntry.id })).status, 403);
    assert.equal((await player.send({ action: 'withdraw', registration_id: partnerEntry.id })).status, 200);
    assert.equal(player.tables.event_registrations.find(row => row.id === partnerEntry.id).status, 'withdrawn');
    assert.equal(player.tables.event_registrations.find(row => row.id === sourceEntry.id).status, 'registered');
    const booking = fixture(evaluate);
    assert.equal((await booking.send({ action: 'remove_partner', registration_id: sourceEntry.id })).status, 200);
    assert.equal(booking.tables.event_registrations.find(row => row.id === partnerEntry.id).status, 'withdrawn');
    assert.equal(booking.tables.event_registrations.find(row => row.id === foreignEntry.id).status, 'registered');
    assert.ok(booking.calls.some(call => call[0] === 'literal' && call[3] === 'partner\\_\\%@example.invalid'));
    const closed = fixture(evaluate, { closed: true });
    const result = await (await closed.send({ action: 'withdraw', registration_id: sourceEntry.id })).json();
    assert.equal(result.refunds[0].status, 'skipped:closed');
    assert.equal(closed.calls.some(call => call[0] === 'write'), false);
  });

  test(version + ' keeps organisation removal scoped and whole-team moves atomic for legacy links', async () => {
    const manager = fixture(evaluate, { email: 'organisation@example.invalid', eventGrants: [101] });
    const removed = await manager.send({ action: 'admin_remove', registration_id: sourceEntry.id, no_refund: true });
    assert.equal(removed.status, 200);
    assert.equal(manager.tables.event_registrations.find(row => row.id === sourceEntry.id).status, 'withdrawn');
    assert.equal(manager.tables.event_registrations.find(row => row.id === foreignEntry.id).status, 'registered');
    const legacy = fixture(evaluate, { entries: [sourceEntry, partnerEntry, foreignEntry] });
    const moved = await legacy.send({ action: 'switch_division', registration_id: sourceEntry.id, target_division_id: 'other-101', move_team: true });
    assert.equal(moved.status, 200);
    assert.deepEqual(legacy.calls.find(call => call[1] === 'move_registration_division'), ['service', 'move_registration_division', {
      p_registration_ids: [sourceEntry.id, partnerEntry.id], p_target_division_id: 'other-101', p_reset_payment: true,
    }]);
    assert.equal(legacy.calls.some(call => call[0] === 'write' && call[1] === 'event_registrations'), false);
  });

  test(version + ' uses only the saved top-up for the exact paid registration and target division', async () => {
    const entries = [{ ...sourceEntry, payment_status: 'paid' }, foreignEntry];
    const payment = {
      id: 'top-up', reference: 'SWITCH-FIXTURE', event_id: 101, status: 'success', amount: 100,
      metadata: { source: 'division_switch', registration_id: 'other-fixture-entry', target_division_id: 'other-101',
        from_division: 'Open', registrant_email: sourceEntry.email },
    };
    const payload = { action: 'switch_division', registration_id: sourceEntry.id, target_division_id: 'other-101', top_up_reference: payment.reference };
    const unrelated = fixture(evaluate, { entries, payments: [payment] });
    assert.equal((await unrelated.send(payload)).status, 400);
    assert.equal(unrelated.calls.some(call => ['write', 'synthetic-email'].includes(call[0]) || call[1] === 'move_registration_division'), false);
    const exact = fixture(evaluate, { entries, payments: [{ ...payment, metadata: {
      ...payment.metadata, registration_id: sourceEntry.id, from_division_id: 'open-101',
    } }] });
    assert.equal((await exact.send(payload)).status, 200);
    assert.deepEqual(exact.calls.find(call => call[1] === 'move_registration_division'), ['service', 'move_registration_division', {
      p_registration_ids: [sourceEntry.id], p_target_division_id: 'other-101', p_reset_payment: false,
    }]);
  });
}
