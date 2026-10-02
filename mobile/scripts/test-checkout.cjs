const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
const source = ts.transpileModule(fs.readFileSync('supabase/functions/native-event-checkout/index.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
function server(overrides = {}) {
  let handler, writes = [], emails = [], gatewayCalls = [];
  const tables = {
    calendar: { id: 1, is_manual: true, is_visible: true, sanction_status: 'approved', event_name: 'Test event', start_date: '2099-01-01', end_date: '2099-01-02', payment_method: 'platform' },
    players: { id: 3, name: 'Test player', email: 'player@example.com', contact_number: '0123456789', license_type: 'none', temporary_licenses: [] },
    tournament_divisions: [{ id: 'division-1', name: 'Open', entry_fee: 350 }],
    event_registrations: [], commerce_config: { event_fee_percent: 5, fee_label: 'Booking fee' }, ...overrides.tables,
  };
  const client = {
    auth: { getUser: async () => ({ data: { user: overrides.user === null ? null : { id: 'user-123456', email: 'player@example.com', ...overrides.user } } }) },
    rpc: (name, args) => Promise.resolve({ data: overrides.rpc ? overrides.rpc(name, args) : [], error: null }),
    from: table => {
      const query = { then: (resolve, reject) => Promise.resolve({ data: tables[table], error: null }).then(resolve, reject) };
      for (const method of ['select', 'eq', 'ilike', 'neq', 'in', 'maybeSingle']) query[method] = () => query;
      for (const method of ['insert', 'update', 'upsert']) query[method] = value => { writes.push({ table, method, value }); return query; };
      return query;
    },
  };
  vm.runInNewContext(source, { exports: {}, require: () => ({ createClient: () => client }),
    Deno: { env: { get: name => name === 'PUSH_TEST_RECIPIENTS' ? overrides.testRecipients : 'test' }, serve: fn => { handler = fn; } },
    Response, Request, URL, Date, Intl, Number, Set, Error, JSON, AbortSignal,
    fetch: async (url, options) => {
      if (url === 'https://api.paystack.co/transaction/initialize' && overrides.gateway) { gatewayCalls.push(JSON.parse(options.body)); return Response.json({ status: true, data: { authorization_url: 'https://checkout.paystack.com/test' } }); }
      if (!url.endsWith('/functions/v1/send-email')) throw new Error('Tests must not contact a payment gateway');
      emails.push(JSON.parse(options.body));
      return Response.json(overrides.emailFailure ? { error: 'provider unavailable' } : { success: true }, { status: overrides.emailFailure ? 500 : 200 });
    },
  });
  return { writes, emails, gatewayCalls, get: url => handler(new Request(url)), call: async input => {
    const response = await handler(new Request('https://example.test', { method: 'POST', headers: { Authorization: 'Bearer test' }, body: JSON.stringify({ action: 'quote', eventId: 1, divisionIds: ['division-1'], ...input }) }));
    return { status: response.status, body: await response.json() };
  } };
}
test('checkout requires a verified account before any write', async () => {
  const app = server({ user: null });
  assert.equal((await app.call({ action: 'checkout' })).status, 401);
  assert.equal(app.writes.length, 0);
});
test('server ignores client pricing and calculates its own total', async () => {
  const app = server();
  const { body } = await app.call({ total: 1, entry_fee: 1, acceptedTotal: 1 });
  assert.equal(body.quote.total, 367.5);
  assert.equal(body.quote.fee, 17.5);
  assert.equal(app.writes.length, 0);
});
test('changed checkout totals require another review before any write', async () => {
  const app = server();
  const result = await app.call({ action: 'checkout', agreed: true, acceptedTotal: 350 });
  assert.equal(result.status, 409);
  assert.equal(app.writes.length, 0);
});
test('non-admins cannot use test payments to obtain paid entries', async () => {
  const app = server();
  const result = await app.call({ isTest: true });
  assert.match(result.body.error, /administrators only/);
  assert.equal(app.writes.length, 0);
});
test('cancelled and closed events cannot be checked out', async () => {
  for (const change of [{ event_status: 'cancelled' }, { registration_closes_at: '2000-01-01' }]) {
    const app = server({ tables: { calendar: { id: 1, is_manual: true, ...change } } });
    assert.equal((await app.call({ action: 'checkout' })).status, 400);
    assert.equal(app.writes.length, 0);
  }
});
test('licence obligations cannot be bypassed by client state', async () => {
  const app = server({ tables: { tournament_divisions: [{ id: 'division-1', name: 'Open', entry_fee: 350, license_required: true }] } });
  const result = await app.call({ hasLicence: true });
  assert.match(result.body.error, /SAPA licence/);
  assert.equal(app.writes.length, 0);
});

test('payment-only restores unpaid entries and ignores replacement partner/division input without writes', async () => {
  const app = server({ tables: { event_registrations: [{ id: 'entry-1', email: 'player@example.com', division_id: 'division-1', division: 'Open', full_name: 'Test player', partner_name: 'Original partner', partner_email: 'original@example.com', payment_status: 'pending', status: 'registered' }] } });
  const { body, status } = await app.call({ mode: 'pay', divisionIds: ['injected-division'], partnerEmail: 'replacement@example.com' });
  assert.equal(status, 200);
  assert.equal(body.quote.mode, 'pay');
  assert.equal(body.quote.entries[0].partnerName, 'Original partner');
  assert.equal(body.quote.total, 367.5);
  assert.equal(app.writes.length, 0);
});
test('payment-only refuses missing, paid, withdrawn and another account entries', async () => {
  for (const regs of [[], [{ email: 'player@example.com', payment_status: 'paid' }], [{ email: 'player@example.com', payment_status: 'pending', status: 'withdrawn' }], [{ email: 'other@example.com', payment_status: 'pending' }]]) {
    const app = server({ tables: { event_registrations: regs } });
    assert.equal((await app.call({ mode: 'pay' })).status, 400);
    assert.equal(app.writes.length, 0);
  }
});
test('payment-only direct-organiser checkout does not rewrite registration or partner rows', async () => {
  const app = server({ tables: { calendar: { id: 1, is_manual: true, payment_method: 'eft' }, event_registrations: [{ id: 'entry-1', email: 'player@example.com', division_id: 'division-1', division: 'Open', payment_status: 'pending', status: 'registered' }] } });
  const result = await app.call({ mode: 'pay', action: 'checkout', agreed: true, acceptedTotal: 367.5, attemptId: '11111111-1111-1111-1111-111111111111' });
  assert.equal(result.status, 200);
  assert.equal(result.body.paymentPending, true);
  assert.equal(app.writes.length, 0);
});

test('payment review restores partner entries registered by the payer, with an explicit opt-out', async () => {
  const app = server({ tables: { event_registrations: [
    { id: 'self', email: 'player@example.com', division_id: 'division-1', division: 'Open', full_name: 'Test player', payment_status: 'pending', status: 'registered' },
    { id: 'partner', email: 'partner@example.com', registered_by: 'player@example.com', division_id: 'division-1', division: 'Open', full_name: 'Original partner', payment_status: 'pending', status: 'registered' },
  ] } });
  const restored = await app.call({ mode: 'pay' });
  assert.equal(restored.body.quote.base, 700);
  assert.equal(restored.body.quote.entries[0].partnerName, 'Original partner');
  assert.equal(restored.body.quote.entries[0].playerCount, 2);
  const selfOnly = await app.call({ mode: 'pay', payForPartner: false });
  assert.equal(selfOnly.body.quote.base, 350);
  assert.equal(app.writes.length, 0);
});

test('different divisions retain independent partner and payer choices', async () => {
  const partners = [{ id: 4, name: 'Partner One', email: 'one@example.com' }, { id: 5, name: 'Partner Two', email: 'two@example.com' }];
  const app = server({ tables: { tournament_divisions: [{ id: 'a', name: 'Open', entry_fee: 350 }, { id: 'b', name: 'Mixed', entry_fee: 200 }] }, rpc: (name, args) => name === 'find_registration_partner' ? partners.filter(p => p.email === args.p_email) : [] });
  const { body, status } = await app.call({ selections: [{ divisionId: 'a', partnerEmail: 'one@example.com', payForPartner: true }, { divisionId: 'b', partnerEmail: 'two@example.com', payForPartner: false }] });
  assert.equal(status, 200);
  assert.equal(body.quote.base, 900);
  assert.equal(body.quote.entries[0].partnerName, 'Partner One');
  assert.equal(body.quote.entries[1].partnerName, 'Partner Two');
  assert.equal(body.quote.entries[1].playerCount, 1);
  assert.equal(app.writes.length, 0);
});
test('licence choices use published prices and are charged once across divisions', async () => {
  const app = server({ tables: { tournament_divisions: [{ id: 'a', name: 'Open', entry_fee: 350, license_required: true }, { id: 'b', name: 'Mixed', entry_fee: 200, license_required: true }], commerce_config: { event_fee_percent: 5, temp_license_enabled: true, temp_license_price: 120, license_fee_percent: 10 } } });
  const { body, status } = await app.call({ selections: [{ divisionId: 'a' }, { divisionId: 'b' }], licenseChoice: 'temporary', licensePrice: 1 });
  assert.equal(status, 200);
  assert.equal(body.quote.licenseTotal, 132);
  assert.equal(body.quote.licenseItems.length, 1);
  assert.equal(body.quote.total, 709.5);
  assert.equal(app.writes.length, 0);
});
test('unavailable temporary licences cannot be purchased by client override', async () => {
  const app = server({ tables: { tournament_divisions: [{ id: 'division-1', name: 'Open', entry_fee: 350, license_required: true }], commerce_config: { temp_license_enabled: false, temp_license_price: 120 } } });
  const result = await app.call({ licenseChoice: 'temporary', temp_license_enabled: true });
  assert.notEqual(result.status, 200);
  assert.match(result.body.error, /not available/);
  assert.equal(app.writes.length, 0);
});

test('sponsor details persist with registration and explicit removal clears the logo', async () => {
  const event = { id: 1, is_manual: true, start_date: '2099-01-01', payment_method: 'eft', collect_tshirt_size: true, allow_tshirt_logo_upload: true, allow_tshirt_sponsor_name: true };
  const app = server({ tables: { calendar: event } });
  const result = await app.call({ action: 'checkout', attemptId: '12345678-1234-1234-1234-123456789abc', agreed: true, acceptedTotal: 367.5, tshirtSize: 'M', tshirtSponsorName: '  NOX  ', tshirtLogoUrl: 'test/storage/v1/object/public/profile-pics/tshirt-logos/1/player_unique.png' });
  assert.equal(result.status, 200);
  const row = app.writes.find(w => w.table === 'event_registrations').value[0];
  assert.equal(row.tshirt_sponsor_name, 'NOX');
  assert.equal(row.tshirt_logo_url, 'test/storage/v1/object/public/profile-pics/tshirt-logos/1/player_unique.png');
  const retry = server({ tables: { calendar: event, event_registrations: [{ id: 'r1', event_id: 1, email: 'player@example.com', full_name: 'Test player', division_id: 'division-1', division: 'Open', status: 'registered', payment_status: 'pending', tshirt_logo_url: row.tshirt_logo_url }] } });
  const cleared = await retry.call({ mode: 'pay', action: 'checkout', attemptId: '12345678-1234-1234-1234-123456789abc', agreed: true, acceptedTotal: 367.5, tshirtLogoUrl: '' });
  assert.equal(cleared.status, 200);
  assert.equal(retry.writes[0].value[0].tshirt_logo_url, null);
  assert.equal(retry.writes[0].value[0].payment_status, 'pending');
});
test('disabled sponsor settings ignore supplied customisations', async () => {
  const app = server({ tables: { calendar: { id: 1, is_manual: true, start_date: '2099-01-01', payment_method: 'eft' } } });
  await app.call({ action: 'checkout', attemptId: '12345678-1234-1234-1234-123456789abc', agreed: true, acceptedTotal: 367.5, tshirtLogoUrl: 'https://untrusted.example/logo', tshirtSponsorName: 'Ignored' });
  const row = app.writes[0].value[0];
  assert.equal(row.tshirt_logo_url, undefined);
  assert.equal(row.tshirt_sponsor_name, undefined);
});
test('checkout rejects logo URLs outside the event storage folder', async () => {
  const app = server({ tables: { calendar: { id: 1, is_manual: true, start_date: '2099-01-01', collect_tshirt_size: true, allow_tshirt_logo_upload: true } } });
  const result = await app.call({ tshirtSize: 'M', tshirtLogoUrl: 'https://untrusted.example/logo.png' });
  assert.notEqual(result.status, 200);
  assert.match(result.body.error, /Upload a logo for this event/);
  assert.equal(app.writes.length, 0);
});
test('new partner logo is kept on the partner row, independently of the payer logo', async () => {
  const app = server({ tables: { calendar: { id: 1, is_manual: true, start_date: '2099-01-01', payment_method: 'eft', collect_tshirt_size: true, allow_tshirt_logo_upload: true } }, rpc: name => name === 'find_registration_partner' ? [{ name: 'Partner', email: 'partner@example.com' }] : [] });
  const prefix = 'test/storage/v1/object/public/profile-pics/tshirt-logos/1/';
  const result = await app.call({ action: 'checkout', attemptId: '12345678-1234-1234-1234-123456789abc', agreed: true, acceptedTotal: 735, tshirtSize: 'M', tshirtLogoUrl: prefix + 'self.png', selections: [{ divisionId: 'division-1', partnerEmail: 'partner@example.com', payForPartner: true, tshirtSize: 'L', tshirtLogoUrl: prefix + 'partner.png' }] });
  assert.equal(result.status, 200);
  const rows = app.writes[0].value;
  assert.equal(rows.find(r => r.email === 'player@example.com').tshirt_logo_url, prefix + 'self.png');
  assert.equal(rows.find(r => r.email === 'partner@example.com').tshirt_logo_url, prefix + 'partner.png');
});

const freeCheckout = { action: 'checkout', agreed: true, acceptedTotal: 0, attemptId: '11111111-1111-1111-1111-111111111111' };
const freeDivision = { tournament_divisions: [{ id: 'division-1', name: 'Open', entry_fee: 0 }] };
test('native free checkout sends a registration email after saving, without claiming a payment', async () => {
  const app = server({ tables: freeDivision });
  const result = await app.call(freeCheckout);
  assert.equal(result.body.registered, true);
  assert.equal(app.emails.length, 1);
  assert.equal(app.emails[0].to, 'player@example.com');
  assert.equal(app.emails[0].template, 'event_registration');
  assert.equal(app.emails[0].variables.paymentMethod, 'free');
  assert.equal(app.emails[0].variables.amountDue, 'R 0.00');
  assert.ok(app.writes.some(w => w.table === 'event_registrations'));
});
test('email failure never turns a saved registration into a checkout failure', async () => {
  const app = server({ tables: freeDivision, emailFailure: true });
  const result = await app.call(freeCheckout);
  assert.equal(result.status, 200);
  assert.equal(result.body.registered, true);
  assert.match(result.body.emailWarning, /entry is saved/);
});
test('a checkout retry for an existing active entry does not resend email', async () => {
  const app = server({ tables: freeDivision, rpc: name => name === 'get_event_registrations_for_matching'
    ? [{ id: 'existing', email: 'player@example.com', division: 'Open', status: 'registered', payment_status: 'paid' }] : [] });
  const result = await app.call(freeCheckout);
  assert.equal(result.body.registered, true);
  assert.equal(app.emails.length, 0);
});
test('test recipient scope also limits native registration emails', async () => {
  for (const testRecipients of ['', 'someone-else@example.com']) {
    const app = server({ tables: freeDivision, testRecipients });
    assert.equal((await app.call(freeCheckout)).body.registered, true);
    assert.equal(app.emails.length, 0);
  }
});

test('valid private access grant never bypasses closed registration', async () => {
  for (const action of ['quote', 'checkout']) {
    const app = server({ tables: { calendar: { id: 1, is_manual: true, registration_access: 'code', registration_closes_at: '2000-01-01T00:00:00Z' } }, rpc: () => true });
    const result = await app.call({ action, accessGrantId: 'valid-grant', agreed: true });
    assert.equal(result.status, 400);
    assert.match(result.body.error, /Registration has closed/);
    assert.equal(app.writes.length, 0);
    assert.equal(app.emails.length, 0);
  }
});

test('payment return redirects only to the fixed native event screen and never marks payment paid', async () => {
  const app = server();
  const reference = 'MOBILE-12345678-11111111-1111-1111-1111-111111111111';
  const response = await app.get(`https://example.test/functions/v1/native-event-checkout/return?event_id=553&reference=${reference}&mode=pay&redirect=https://evil.test`);
  assert.equal(response.status,302);
  const target=new URL(response.headers.get('location'));
  assert.equal(target.protocol,'fourmpadel:');assert.equal(target.hostname,'events');assert.equal(target.pathname,'/register');assert.equal(target.searchParams.get('id'),'553');assert.equal(target.searchParams.get('mode'),'pay');assert.equal(target.searchParams.get('pay_ref'),reference);
  assert.equal(app.writes.length,0);assert.equal(app.emails.length,0);
  assert.equal((await app.get('https://example.test/functions/v1/native-event-checkout/return?event_id=bad&reference=bad')).status,400);
});

test('new native checkout gives Paystack the app return endpoint', async () => {
 const app=server({gateway:true});
 const result=await app.call({action:'checkout',agreed:true,acceptedTotal:367.5,attemptId:'11111111-1111-1111-1111-111111111111'});
 assert.equal(result.status,200);assert.equal(app.gatewayCalls.length,1);
 assert.equal(app.gatewayCalls[0].callback_url,'test/functions/v1/native-event-checkout/return?event_id=1');
 assert.equal(result.body.authorizationUrl,'https://checkout.paystack.com/test');
});

test('adding a partner to a paid solo entry charges only the new partner', async () => {
  const existing = { id: 'entry-1', email: 'player@example.com', division_id: 'division-1', division: 'Open', full_name: 'Test player', partner_email: null, payment_status: 'paid', status: 'registered' };
  const app = server({ tables: { event_registrations: [existing] }, rpc: name => name === 'get_event_registrations_for_matching' ? [existing] : name === 'find_registration_partner' ? [{ name: 'Partner', email: 'partner@example.com' }] : [] });
  const { body, status } = await app.call({ partnerEmail: 'partner@example.com', payForPartner: true });
  assert.equal(status, 200);
  assert.equal(body.quote.total, 367.5);
  assert.equal(body.quote.entries[0].paymentStatus, 'paid');
  assert.equal(body.quote.entries[0].playerCount, 1);
  assert.equal(app.writes.length, 0);
});
