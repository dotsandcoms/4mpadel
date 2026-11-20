import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
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

const [nativeHandler, confirmHandler, refundHandler, mobileRefundHandler, refundWebhook] = await Promise.all([
  compileHandler('../mobile/supabase/functions/native-event-checkout/index.ts'),
  compileHandler('../supabase/functions/confirm-manual-payment/index.ts'),
  compileHandler('../supabase/functions/paystack-refund/index.ts'),
  compileHandler('../mobile/supabase/functions/paystack-refund/index.ts'),
  compileHandler('../supabase/functions/paystack-webhook/index.ts'),
]);
const appSource = await readFile(new URL('../mobile/src/lib/payment-return.ts', import.meta.url), 'utf8');
const parser = await transform(appSource, { loader: 'ts', format: 'esm' });
const { parsePaymentReturn } = await import(`data:text/javascript;base64,${Buffer.from(parser.code).toString('base64')}`);

function query(resolve) {
  const filters = {};
  let changes;
  const builder = {
    eq: (column, value) => { filters[column] = value; return builder; },
    select: () => builder, ilike: () => builder, neq: () => builder, in: () => builder,
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

const reviewedReference = '4m-refund-41aa2db7fe2045b3b79c5cb4de523479';
const refundId = '7121a425-0cc5-44f5-b8a0-85830db37a4d';
const regId = '32faf63b-8aa3-4c48-9bd5-6376fcff41e9';
const payId = 'ccb2cfb0-05bb-4753-be89-601dbe176949';
const gatewayId = 16723;

function refundFixture({ reference = namedReference, licence = false, metadata = { verify_failed: true }, previousId = null, mode = 'live' } = {}) {
  const amount = licence ? 120 : 300;
  const payment = { id: payId, event_id: 517, reference: licence ? `LIC-${reference}` : reference,
    is_test: mode === 'test', status: 'success', payment_method: 'paystack', metadata: licence ? { parent_reference: reference } : {} };
  const refund = { id: refundId, event_registration_id: regId, payment_id: payment.id, amount, currency: 'ZAR', status: 'failed', metadata, paystack_refund_id: previousId };
  const registration = { id: regId, event_id: 517 };
  const calls = [];
  const service = {
    from: table => query((filters, changes) => {
      if (table === 'payments') { assert.equal(filters.id, payment.id); return { ...payment }; }
      if (table === 'event_registrations') { assert.equal(filters.id, registration.id); return registration; }
      assert.equal(table, 'payment_refunds');
      if (filters.paystack_reference === reference) return [{ ...refund }];
      assert.ok(filters.id === refund.id || filters.paystack_refund_id === refund.paystack_refund_id
        || filters['metadata->reviewed_retry->>reference'] === refund.metadata.reviewed_retry?.reference);
      if (changes) Object.assign(refund, changes);
      return { ...refund, metadata: { ...refund.metadata } };
    }),
    async rpc(name, args) {
      assert.equal(args.p_refund_id, refundId);
      assert.equal(args.p_event_id, 517);
      assert.equal(args.p_registration_id, regId);
      calls.push([name,args]);
      if (name === 'claim_event_refund_retry') {
        assert.equal(args.p_transaction_ref, reference);
        assert.equal(args.p_amount, amount);
        if (refund.status !== 'failed') return ok(null);
        refund.status = 'needs_attention';
        refund.paystack_refund_id = null;
        refund.metadata.reviewed_retry = { reference: reviewedReference, phase: 'held', method: 'paystack', domain: mode,
          transaction_reference: reference, transaction_id: String(gatewayId) };
        return ok(refund.metadata.reviewed_retry);
      }
      assert.equal(name, 'apply_event_refund_retry_evidence');
      assert.equal(args.p_reference, reviewedReference);
      refund.status = args.p_status;
      refund.paystack_refund_id = args.p_provider_id;
      refund.metadata.reviewed_retry.phase = 'verified';
      return ok({ id: refund.id, status: refund.status, paystack_refund_id: refund.paystack_refund_id });
    },
  };
  const transaction = () => Response.json({ status: true, data: { id: gatewayId, reference, status: 'success', currency: 'ZAR', domain: mode, amount: 42000 } });
  const receipt = (extra = {}) => ({ reference: reviewedReference, id: 42, status: 'pending', amount: amount * 100,
    currency: 'ZAR', domain: mode, transaction: gatewayId, ...extra });
  return { service, calls, refund, payment, receipt, transaction, reference };
}

function sendRefund(action, body = {}, bearer = 'service') {
  return new Request(`${endpoint}/paystack-refund`, { method: 'POST', headers: { Authorization: `Bearer ${bearer}` },
    body: JSON.stringify({ action, payment_refund_id: refundId, ...body }) });
}
const exact = { event_id: 517, reviewed_registration_id: regId };

for (const [name, edge] of [['web', refundHandler], ['installed app', mobileRefundHandler]]) {
  for (const reference of [oldToken, namedReference]) {
    for (const licence of [false, true]) {
      test(`${name} legacy retry keeps the ${reference === oldToken ? 'legacy' : 'named'} ${licence ? 'split licence' : 'entry'} checkout parent`, async () => {
        const fixture = refundFixture({ reference, licence });
        const calls = [];
        const handler = edge(() => fixture.service, async (url, options) => {
          calls.push(url);
          if (url === `https://api.paystack.co/transaction/verify/${reference}`) return fixture.transaction();
          assert.equal(url, 'https://api.paystack.co/refund');
          assert.equal(fixture.refund.status, 'needs_attention');
          assert.deepEqual(JSON.parse(options.body), { transaction: reference, amount: fixture.refund.amount * 100, currency: 'ZAR', reference: reviewedReference });
          return Response.json({ status: true, data: fixture.receipt() });
        });
        const result = await handler(sendRefund('retry_failed'));
        assert.equal(result.status, 200);
        const body = await result.json();
        assert.equal(body.paystack_reference, reference);
        assert.equal(body.status, 'processing');
        assert.equal(body.retried, true);
        assert.equal(calls.length, 2);
      });
    }
  }

  test(`${name} concurrent retry claims send one POST and reconcile an ambiguous attempt without resubmission`, async () => {
    const fixture = refundFixture();
    let submitted = 0;
    let statusChecks = 0;
    let providerCanVerify = false;
    let received;
    const started = new Promise(resolve => { received = resolve; });
    let release;
    const hold = new Promise(resolve => { release = resolve; });
    const handler = edge(() => fixture.service, async (url, options) => {
      if (url.includes('/transaction/verify/')) return fixture.transaction();
      if (options.method === 'POST') { submitted++; received(); await hold; throw new Error('Fixture network disconnected'); }
      assert.equal(url, `https://api.paystack.co/refund?reference=${reviewedReference}`);
      statusChecks++;
      return Response.json({ status: true, data: providerCanVerify ? [fixture.receipt({status:'processed'})] : [] });
    });
    const first = handler(sendRefund('reviewed_retry_failed', exact));
    await started;
    const concurrent = await handler(sendRefund('retry_failed'));
    assert.equal(concurrent.status, 409);
    assert.equal((await concurrent.json()).retry_held, true);
    release();
    const indeterminate = await first;
    assert.equal(indeterminate.status, 409);
    assert.equal(fixture.refund.status, 'needs_attention');
    assert.equal(fixture.refund.metadata.reviewed_retry.phase, 'held');
    assert.equal((await handler(sendRefund('reconcile_retry', exact))).status, 409);
    providerCanVerify = true;
    const proven = await handler(sendRefund('reconcile_retry', exact));
    assert.equal(proven.status, 200);
    assert.equal((await proven.json()).status, 'processed');
    assert.equal(submitted, 1);
    assert.equal(statusChecks, 3);
  });

  test(`${name} handles Paystack's duplicate-reference response by fetching the same refund`, async () => {
    const fixture = refundFixture();
    let submitted = 0;
    const handler = edge(() => fixture.service, async (url, options) => {
      if (url.includes('/transaction/verify/')) return fixture.transaction();
      if (options.method === 'POST') {
        submitted++;
        return Response.json({ status: false, message: 'Refund reference already exists' }, { status: 409 });
      }
      assert.equal(url, `https://api.paystack.co/refund?reference=${reviewedReference}`);
      return Response.json({ status: true, data: [fixture.receipt()] });
    });
    const result = await handler(sendRefund('reviewed_retry_failed', exact));
    assert.equal(result.status, 200);
    assert.equal((await result.json()).status, 'processing');
    assert.equal(submitted, 1);
  });

  test(`${name} denies delegated roles, wrong event and unknown history before any upstream request`, async () => {
    const fixture = refundFixture({ metadata: { paystack_error: 'connection timeout' } });
    const actor = { auth: { getUser: async () => ok({user}) }, rpc: async name => ok(name === 'account_is_active') };
    const handler = edge((_url, key) => key === 'service' ? fixture.service : actor, async () => { throw new Error('unexpected network request'); });
    assert.equal((await handler(sendRefund('reviewed_retry_failed', exact, 'tenant'))).status, 403);
    assert.equal((await handler(sendRefund('reviewed_retry_failed', { ...exact, event_id: 518 }))).status, 404);
    assert.equal((await handler(sendRefund('reviewed_retry_failed', { event_id: 517, registration_id: regId }))).status, 400);
    assert.equal((await handler(sendRefund('unknown_operation', { event_id: 517, registration_id: regId }))).status, 400);
    assert.equal((await handler(sendRefund('retry_failed'))).status, 409);
    assert.equal(fixture.calls.length, 0);
  });

  test(`${name} existing Paystack retry fetches exact provider evidence, rejects mismatches and preserves an already processed refund`, async () => {
    const fixture = refundFixture({ metadata: {}, previousId: '42', mode: 'test' });
    let confirmed = false;
    const handler = edge(() => fixture.service, async (url, options) => {
      assert.equal(options.headers.Authorization, 'Bearer synthetic-test-key');
      if (url.includes('/transaction/verify/')) return fixture.transaction();
      assert.equal(url, 'https://api.paystack.co/refund/42');
      assert.notEqual(options.method, 'POST');
      return Response.json({ status: true, data: fixture.receipt({ id: 42, status: 'processed', domain: confirmed ? 'test' : 'live' }) });
    }, { PAYSTACK_SECRET_KEY_TEST: 'synthetic-test-key' });
    assert.equal((await handler(sendRefund('reviewed_retry_failed', exact))).status, 409);
    assert.equal(fixture.calls.length, 0);
    confirmed = true;
    const result = await handler(sendRefund('reviewed_retry_failed', exact));
    assert.equal(result.status, 200);
    assert.equal((await result.json()).status, 'processed');
    assert.equal(fixture.refund.paystack_refund_id, '42');
  });
}

test('signed Paystack webhook accepts an exact reviewed reference and preserves legacy known-provider-ID refunds', async () => {
  const fixture = refundFixture();
  await fixture.service.rpc('claim_event_refund_retry', {
    p_refund_id: refundId, p_event_id: 517, p_registration_id: regId, p_amount: 300, p_transaction_ref: fixture.reference,
  });
  const handler = refundWebhook(() => fixture.service, () => { throw new Error('unexpected network request'); });
  function webhook(data, event = 'refund.processed') {
    const body = JSON.stringify({ event, data });
    const signature = createHmac('sha512', 'mock-paystack-key').update(body).digest('hex');
    return new Request(`${endpoint}/paystack-webhook`, { method: 'POST', headers: { 'x-paystack-signature': signature }, body });
  }
  const data = fixture.receipt({ status: 'processed' });
  const wrong = await handler(webhook({ ...data, amount: data.amount + 1 }));
  assert.equal((await wrong.json()).updated, false);
  assert.equal(fixture.refund.status, 'needs_attention');
  const ambiguous = await handler(webhook({ transaction_reference: fixture.reference, amount: 30000 }));
  assert.equal((await ambiguous.json()).reason, 'reviewed_refund_requires_exact_reference');
  assert.equal(fixture.refund.status, 'needs_attention');
  const result = await handler(webhook(data));
  assert.equal((await result.json()).updated, true);
  assert.equal(fixture.refund.status, 'processed');
  // An existing refund with no claim continues to use its known provider ID.
  fixture.refund.metadata = {};
  fixture.refund.status = 'processing';
  fixture.refund.event_registration_id = null;
  const legacy = await handler(webhook({ id: 42, transaction_reference: fixture.reference, amount: 30000 }));
  assert.equal((await legacy.json()).updated, true);
  assert.equal(fixture.refund.status, 'processed');
  fixture.refund.status = 'pending';
  fixture.refund.paystack_refund_id = null;
  const legacyByReference = await handler(webhook({ transaction_reference: fixture.reference, amount: 30000 }));
  assert.equal((await legacyByReference.json()).updated, true);
  assert.equal(fixture.refund.status, 'processed');
});
