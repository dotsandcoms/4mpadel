const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const mod = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/home.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
  { module: mod, exports: mod.exports, require: () => ({}), Date, Map, Set });
const { registrationStates, resolveFeaturedCta } = mod.exports;
const base = { id: 1, start_date: '2099-10-10', registrationKnown: true, allow_payments: true };
const cta = patch => resolveFeaturedCta({ ...base, ...patch });
const own = (extra = {}) => ({ event_id: 1, email: 'me@example.com', payment_status: 'paid', partner_payment_status: 'pending', ...extra });

test('unregistered and saved-only events offer registration', () => {
  assert.equal(cta({ isRegistered: false }).action, 'register');
  assert.equal(cta({ fromSchedule: true, isRegistered: false }).label, 'Register');
});
test('paid registration opens entry, never registration', () => {
  const state = registrationStates([own()], [], 'me@example.com').get(1);
  assert.equal(cta(state).label, 'View my entry');
  assert.equal(cta(state).action, 'manage');
});
test('partner uses their own payment status', () => {
  const state = registrationStates([own()], [], 'partner@example.com').get(1);
  assert.equal(cta(state).label, 'Complete payment');
  assert.equal(cta(state).action, 'pay');
});
test('pending or failed payment takes precedence across multiple divisions', () => {
  for (const status of ['pending', 'failed', 'unpaid']) {
    const state = registrationStates([own(), own({ payment_status: status })], [{ event_id: 1 }], 'ME@example.com').get(1);
    assert.equal(cta(state).action, 'pay');
  }
});
test('paid participant is registered even without an event-registration row', () => {
  const state = registrationStates([], [{ event_id: 1 }], 'me@example.com').get(1);
  assert.equal(cta(state).action, 'manage');
});
test('no payment is inferred from event fees or unknown status', () => {
  assert.equal(cta({ isRegistered: true, entry_fee: 500, isPaid: false }).action, 'manage');
  assert.equal(cta({ isRegistered: true, hasOutstandingPayment: true, allow_payments: false }).action, 'manage');
  assert.equal(cta({ registrationKnown: false }).action, 'view');
});
test('registration deadlines do not hide an existing payment or entry', () => {
  const closed = { registration_closes_at: '2000-01-01' };
  assert.equal(cta(closed).action, 'view');
  assert.equal(cta({ ...closed, isRegistered: true, hasOutstandingPayment: true }).action, 'pay');
  assert.equal(cta({ ...closed, isRegistered: true, isPaid: true }).action, 'manage');
  assert.equal(cta({ registration_opens_at: '2099-10-01' }).action, 'view');
});
test('finished events show results', () => {
  assert.equal(cta({ end_date: '2000-01-01', isRegistered: true }).label, 'View results');
});
