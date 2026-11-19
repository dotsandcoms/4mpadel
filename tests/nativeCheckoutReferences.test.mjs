import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { build, transform } from 'esbuild';
import { nativePaystackReference } from '../mobile/supabase/functions/native-event-checkout/references.mjs';

const event = { id: 517, event_name: 'Rockets Cup SAPA Gold 1000', is_manual: true, is_weekly: true, entry_fee: 300 };
const user = { id: '40dbeb56-0000-4000-8000-000000000000', name: 'Player', email: 'player@example.test', contact_number: '0100000000' };
const attemptId = '11111111-1111-4111-8111-111111111111';
const appToken = 'MOBILE-40dbeb56-11111111-1111-4111-8111-111111111111';
const oldToken = 'MOBILE-40dbeb56-22222222-2222-4222-8222-222222222222';
const namedReference = 'MOBILE-ROCKETS-CUP-SAPA-GOLD-1000-17949878596810000000042';
const endpoint = 'https://supabase.example.test/functions/v1';
const checkoutUrl = 'https://checkout.paystack.com/test-only';
const ok = data => ({ data, error: null });
const post = (name, data) => new Request(`${endpoint}/${name}`, {
  method: 'POST', headers: { Authorization: 'Bearer fixture' }, body: JSON.stringify(data),
});

async function compileHandler(file) {
  const result = await build({
    entryPoints: [new URL(file, import.meta.url).pathname], bundle: true, write: false, platform: 'neutral',
    plugins: [{
      name: 'mock-edge-runtime',
      setup(plugin) {
        plugin.onResolve({ filter: /^https:\/\// }, ({ path }) => ({ path, namespace: 'fixture' }));
        plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => {
          if (path.startsWith('https://esm.sh/@supabase/supabase-js@')) return { contents: 'export const createClient = mockClient;' };
          if (path.startsWith('https://deno.land/std@') && path.endsWith('/http/server.ts')) return { contents: 'export const serve = mockServe;' };
          throw new Error(`Unexpected Edge import ${path}`);
        });
      },
    }],
  });
  const evaluate = new Function('Deno', 'fetch', 'mockClient', 'mockServe', 'console', result.outputFiles[0].text);
  return (mockClient, fetch, extraEnv = {}) => {
    let handler;
    const serve = fn => { handler = fn; };
    const env = { SUPABASE_URL: 'https://supabase.example.test', SUPABASE_ANON_KEY: 'anon',
      SUPABASE_SERVICE_ROLE_KEY: 'service', PAYSTACK_SECRET_KEY: 'mock-paystack-key', ...extraEnv };
    evaluate({ serve, env: { get: key => env[key] } }, fetch, mockClient, serve, { log() {}, error() {} });
    assert.equal(typeof handler, 'function');
    return handler;
  };
}

const [nativeHandler, confirmHandler, refundHandler] = await Promise.all([
  compileHandler('../mobile/supabase/functions/native-event-checkout/index.ts'),
  compileHandler('../supabase/functions/confirm-manual-payment/index.ts'),
  compileHandler('../supabase/functions/paystack-refund/index.ts'),
]);
const appSource = await readFile(new URL('../mobile/src/lib/payment-return.ts', import.meta.url), 'utf8');
const parser = await transform(appSource, { loader: 'ts', format: 'esm' });
const { parsePaymentReturn } = await import(`data:text/javascript;base64,${Buffer.from(parser.code).toString('base64')}`);

function query(resolve) {
  const filters = {};
  let changes;
  const builder = {
    eq: (column, value) => { filters[column] = value; return builder; },
    select: () => builder, ilike: () => builder, neq: () => builder,
    update: value => { changes = value; return builder; },
    maybeSingle: () => builder,
    then: (fulfilled, rejected) => Promise.resolve().then(() => ok(resolve(filters, changes))).then(fulfilled, rejected),
  };
  return builder;
}

test('mobile references keep the app prefix, normalize event names and fit the receipt format', () => {
  assert.equal(nativePaystackReference(event, 1794987859681, 42), namedReference);
  assert.equal(nativePaystackReference({ id: 517, event_name: '  Île / Padel 🏆  ' }, 1794987859681, 42),
    'MOBILE-ILE-PADEL-17949878596810000000042');
  assert.equal(nativePaystackReference({ id: 517, event_name: '🏆' }, 1794987859681, 42),
    'MOBILE-EVENT-517-17949878596810000000042');
  assert.equal(nativePaystackReference({ id: 517, event_name: 'A'.repeat(80) }, 1794987859681, 42).length, 67);
});

test('native checkout initializes once, resumes after rename and returns the installed app token', async () => {
  let receipt;
  let initialized;
  let eventName = event.event_name;
  let gatewayCalls = 0;
  const authenticated = {
    auth: { getUser: async () => ok({ user }) },
    from: table => query(() => {
      const fixtures = { calendar: { ...event, event_name: eventName }, players: { ...user, id: 8 },
        event_registrations: [], commerce_config: { event_fee_percent: 0 }, license_seasons: {} };
      assert.ok(table in fixtures, table);
      return fixtures[table];
    }),
    rpc: async name => {
      assert.ok(['player_license_eligibility', 'get_event_registrations_for_matching', 'reserve_event_registration_places'].includes(name), name);
      return ok(name === 'get_event_registrations_for_matching' ? [] : {});
    },
  };
  const service = {
    rpc: async (name, p) => {
      if (name === 'prepare_native_checkout_payment') {
        assert.equal(p.p_app_reference, appToken);
        assert.match(p.p_gateway_reference, /^MOBILE-(ROCKETS-CUP-SAPA-GOLD-1000|RENAMED)-\d{23}$/);
        receipt ??= { id: 'payment', player_id: p.p_player_id, event_id: p.p_event_id, status: 'processing', amount: p.p_amount,
          is_test: p.p_is_test, reference: p.p_gateway_reference, metadata: { ...p.p_metadata, reference: p.p_gateway_reference,
            registration_rows: p.p_metadata.registration_rows.map(row => Object.fromEntries(Object.entries(row).reverse())) } };
        return ok(receipt);
      }
      if (name === 'save_native_checkout_url') {
        assert.equal(p.p_reference, receipt.reference);
        receipt.metadata.native_authorization_url = p.p_url;
        return ok(p.p_url);
      }
      assert.equal(name, 'resolve_native_checkout_reference');
      return ok(p.p_reference === receipt.reference
        ? { app_reference: appToken, event_id: 517, gateway_reference: receipt.reference } : null);
    },
  };
  const handler = nativeHandler((_url, key) => key === 'service' ? service : authenticated, async (url, options) => {
    assert.equal(url, 'https://api.paystack.co/transaction/initialize');
    gatewayCalls++;
    initialized = JSON.parse(options.body);
    assert.equal(initialized.reference, receipt.reference);
    assert.equal(initialized.metadata.reference, receipt.reference);
    assert.equal(initialized.amount, 30000);
    return Response.json({ status: true, data: { authorization_url: checkoutUrl, reference: receipt.reference } });
  });
  const attempt = { eventId: 517, action: 'checkout', agreed: true, acceptedTotal: 300, attemptId };
  const start = () => handler(post('native-event-checkout', attempt));
  const initial = await start();
  assert.equal(initial.status, 200);
  const response = await initial.json();
  assert.equal(response.reference, appToken);
  assert.equal(response.authorizationUrl, checkoutUrl);
  eventName = 'Renamed';
  assert.equal((await (await start()).json()).authorizationUrl, checkoutUrl);
  assert.equal(gatewayCalls, 1);

  const callback = async (reference, id = 517, field = 'reference') => {
    const url = new URL(initialized.callback_url);
    url.searchParams.set(field, reference);
    url.searchParams.set('event_id', String(id));
    url.searchParams.set('mode', 'pay');
    return handler(new Request(url));
  };
  for (const [providerReference, expected] of [[receipt.reference, appToken], [oldToken, oldToken]]) {
    const result = await callback(providerReference, 517, 'trxref');
    assert.equal(result.status, 302);
    assert.deepEqual(parsePaymentReturn(result.headers.get('Location')), { eventId: '517', reference: expected, mode: 'pay' });
  }
  assert.equal((await callback(receipt.reference, 518)).status, 400);
  assert.equal((await callback('MOBILE-UNKNOWN-17949878596810000000043')).status, 400);
});

for (const [requested, reference] of [[appToken, namedReference], [oldToken, oldToken]]) {
  test(`confirms a ${reference === oldToken ? 'legacy' : 'named'} checkout against its original Paystack charge`, async () => {
    const payment = { id: 'payment', reference, amount: 300, currency: 'ZAR', is_test: false, status: 'processing', metadata: { source: 'manual_event' } };
    const service = {
      from: table => query((filters, changes) => {
        assert.equal(table, 'payments');
        if (changes) {
          assert.equal(filters.id, payment.id);
          assert.deepEqual(changes, { status: 'success' });
          return [{ ...payment, ...changes }];
        }
        assert.equal(filters.reference, reference);
        return payment;
      }),
      rpc: async (name, params) => {
        if (name === 'resolve_native_checkout_reference') {
          assert.equal(params.p_reference, requested);
          return ok(reference === oldToken ? null : { gateway_reference: reference });
        }
        if (name === 'payment_verification_context') {
          assert.equal(params.p_reference, reference);
          return ok(payment);
        }
        assert.equal(name, 'finalize_paid_event_checkout');
        assert.equal(params.p_payment_id, payment.id);
        return ok({ savedRows: [], persisted: true });
      },
    };
    let allowed = false;
    let verifyCalls = 0;
    const caller = { auth: { getUser: async () => ok({ user }) }, rpc: async (name, p) => {
      assert.equal(name, 'event_checkout_state');
      assert.equal(p.p_reference, reference);
      return allowed ? ok({ state: 'awaiting_payment' }) : { data: null, error: 'Forbidden' };
    } };
    const handler = confirmHandler((_url, key) => key === 'service' ? service : caller, async url => {
      assert.equal(url, `https://api.paystack.co/transaction/verify/${reference}`);
      verifyCalls++;
      return Response.json({ status: true, data: { reference, amount: 30000, currency: 'ZAR', status: 'success', domain: 'live' } });
    });
    const request = () => post('confirm-manual-payment', { reference: requested });
    assert.equal((await handler(request())).status, 403);
    assert.equal(verifyCalls, 0);
    allowed = true;
    const result = await handler(request());
    assert.equal(result.status, 200);
    assert.equal((await result.json()).processed, true);
    assert.equal(verifyCalls, 1);
  });
}

for (const reference of [oldToken, namedReference]) {
  for (const licence of [false, true]) {
    test(`retries a ${reference === oldToken ? 'legacy' : 'named'} ${licence ? 'split licence' : 'entry'} refund using the parent Paystack charge`, async () => {
      const payment = { id: 'payment', reference: licence ? `LIC-${reference}` : reference, is_test: false,
        metadata: licence ? { parent_reference: reference } : {} };
      const refund = { id: 'refund', payment_id: payment.id, amount: licence ? 120 : 300, status: 'failed' };
      let refundUpdates;
      const service = { from: table => query((filters, changes) => {
        if (table === 'payments') {
          assert.equal(filters.id, payment.id);
          return payment;
        }
        assert.equal(table, 'payment_refunds');
        assert.equal(filters.id, refund.id);
        if (changes) refundUpdates = changes;
        return refund;
      }) };
      const providerCalls = [];
      const handler = refundHandler(() => service, async (url, options) => {
        providerCalls.push(url);
        if (url === `https://api.paystack.co/transaction/verify/${reference}`) {
          return Response.json({ data: { reference, status: 'success', amount: 42000 } });
        }
        assert.equal(url, 'https://api.paystack.co/refund');
        assert.deepEqual(JSON.parse(options.body), { transaction: reference, amount: refund.amount * 100 });
        return Response.json({ status: true, data: { id: 42, status: 'pending' } });
      });
      const result = await handler(new Request(`${endpoint}/paystack-refund`, {
        method: 'POST', headers: { Authorization: 'Bearer service' },
        body: JSON.stringify({ action: 'retry_failed', payment_refund_id: refund.id }),
      }));
      assert.equal(result.status, 200);
      assert.equal((await result.json()).paystack_reference, reference);
      assert.equal(refundUpdates.paystack_reference, reference);
      assert.equal(refundUpdates.status, 'processing');
      assert.equal(providerCalls.length, 2);
    });
  }
}
