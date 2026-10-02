const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const source = compile('src/lib/home.ts');
const own = patch => ({ id: 'reg-1', event_id: 553, email: 'me@example.com', payment_status: 'paid', division: 'Open', calendar: { event_name: 'Brad Test', start_date: '2099-10-01' }, ...patch });
function setup(rows, due = .5, fail = false) {
  const calls = [];
  const query = { select() { return this; }, or() { return this; }, async neq() { return { data: rows }; } };
  const mod = { exports: {} };
  vm.runInNewContext(source, { module: mod, exports: mod.exports, Date, Map, Set, console, require: id => ({
    supabase: { from: () => query }, joinedOne: v => Array.isArray(v) ? v[0] : v,
    formatMoney: n => `R ${n.toFixed(2)}`,
    fetchEntryBalances: async id => { calls.push(id); if (fail) throw Error('Offline'); return rows.filter(r => r.email === 'me@example.com').map(r => ({ registrationId: r.id, known: true, paid: 1, price: 1 + due, due })); },
  }) });
  return { ...mod.exports, calls };
}
test('paid entry with a price increase becomes a native balance action', async () => {
  const api = setup([own()]);
  const [action] = await api.fetchPendingPayments('me@example.com');
  assert.equal(action.balanceDue, .5);
  assert.match(action.detail, /R 1.00 paid · R 0.50 outstanding/);
  assert.equal(action.path, '/events/pay-balance?registrationId=reg-1');
  assert.equal(action.eventId, 553);
});
test('verified full payment clears the action', async () => {
  assert.equal((await setup([own()], 0).fetchPendingPayments('me@example.com')).length, 0);
});
test('one summary request per event, distinct divisions retain their own action', async () => {
  const api = setup([own(), own({ id: 'reg-2', division: 'Mixed' })]);
  assert.equal((await api.fetchPendingPayments('me@example.com')).length, 2);
  assert.equal(api.calls.length, 1);
});
test('partner does not inherit registrant balance and original unpaid entries retain checkout', async () => {
  const api = setup([own({ email: 'partner@example.com', partner_payment_status: 'paid' }), own({ id: 'reg-2', payment_status: 'unpaid' }), own({ id: 'reg-3' })]);
  const actions = await api.fetchPendingPayments('me@example.com');
  assert.equal(actions.length, 2);
  assert.equal(actions[0].path, '/events/register?id=553&mode=pay');
});
test('balance debt persists after event start and verification failure offers retry', async () => {
  const past = own({ calendar: { event_name: 'Past event', start_date: '2020-01-01' } });
  assert.equal((await setup([past]).fetchPendingPayments('me@example.com'))[0].balanceDue, .5);
  assert.equal((await setup([past], .5, true).fetchPendingPayments('me@example.com'))[0].title, 'Check entry balance');
});
test('balance CTAs manage existing entry rather than charging full registration again', () => {
  const api = setup([]);
  const event = { hasEntryBalance: true, isRegistered: true, isPaid: false, allow_payments: true, entry_fee: 1.5 };
  assert.equal(api.resolveScheduleEntryCta(event).action, 'manage');
  assert.equal(api.resolveFeaturedCta(event).action, 'manage');
});
test('pending balance links never open a browser', async () => {
  const mod = { exports: {} }, routes = [], browsers = [];
  vm.runInNewContext(compile('src/lib/site.ts'), { module: mod, exports: mod.exports, require: () => ({ router: { push: r => routes.push(r) }, openBrowserAsync: url => browsers.push(url) }) });
  await mod.exports.openSitePath('/events/pay-balance?registrationId=reg-1');
  assert.equal(routes[0].pathname, '/events/pay-balance');
  assert.equal(routes[0].params.registrationId, 'reg-1');
  assert.equal(browsers.length, 0);
});
