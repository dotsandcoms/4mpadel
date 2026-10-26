const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
function load(file, env = {}) { const mod = { exports: {} }; vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: mod, exports: mod.exports, ...env }); return mod.exports; }
const template = load('supabase/functions/native-welcome-email/template.ts');
function setup() {
  const state = { user: { id: 'u1', email: 'player@example.com', email_confirmed_at: '2026-01-01' }, player: { name: '<Brad>' }, row: null, sends: [], ok: true };
  let handler;
  const db = { auth: { getUser: async () => ({ data: { user: state.user } }) }, from(table) {
    let update, insert, filters = [];
    const q = {
      select() { return q; }, limit() { return q; }, eq(k, v) { filters.push(r => r[k] === v); return q; }, lte(k, v) { filters.push(r => r[k] <= v); return q; },
      upsert(value) { insert = value; return q; }, update(value) { update = value; return q; },
      run() {
        if (table === 'players') return { data: state.player, error: null };
        if (insert && !state.row) state.row = { ...insert, status: 'pending', next_attempt_at: new Date(0).toISOString(), first_attempt_at: null };
        let row = state.row;
        if (row && !filters.every(f => f(row))) row = null;
        if (row && update) Object.assign(row, update);
        return { data: row ? { ...row } : null, error: null };
      },
      async single() { return q.run(); }, async maybeSingle() { return q.run(); }, then(resolve, reject) { return Promise.resolve(q.run()).then(resolve, reject); },
    }; return q;
  } };
  load('supabase/functions/native-welcome-email/index.ts', {
    require: name => name.includes('template') ? template : { createClient: () => db },
    Deno: { env: { get: k => k === 'RESEND_VERIFIED_SENDER' ? 'notifications.4mpadel.co.za' : 'configured' }, serve: fn => handler = fn },
    Response, Date, AbortSignal, console,
    fetch: async (_url, options) => { state.sends.push(options); return new Response(JSON.stringify(state.ok ? { id: 'message-1' } : { error: 'failed' }), { status: state.ok ? 200 : 503 }); },
  });
  return { state, call: () => handler({ method: 'POST', headers: new Headers(), json: async () => ({ to: 'attacker@example.com' }) }) };
}
test('requires authenticated verified account and own existing player', async () => {
  const { state, call } = setup(); state.user = null; assert.equal((await call()).status, 401);
  state.user = { id: 'u1', email: 'player@example.com', email_confirmed_at: 'yes' }; state.player = null;
  assert.equal((await call()).status, 409); assert.equal(state.sends.length, 0);
});
test('sends to own email, escapes name, stores acceptance and suppresses repeats', async () => {
  const { state, call } = setup(); assert.equal((await call()).status, 200); assert.equal((await call()).status, 200);
  assert.equal(state.sends.length, 1); const payload = JSON.parse(state.sends[0].body);
  assert.deepEqual(payload.to, ['player@example.com']); assert.match(payload.html, /&lt;Brad&gt;/);
  assert.match(payload.text, /international pros/); assert.match(payload.text, /outstanding balances/);
  assert.equal(state.row.status, 'sent');
});
test('failed delivery retries the identical payload and idempotency key', async () => {
  const { state, call } = setup(); state.ok = false; assert.equal((await call()).status, 202);
  await call(); assert.equal(state.sends.length, 1); // retry backoff
  state.row.next_attempt_at = new Date(0).toISOString(); state.ok = true; state.player.name = 'Changed Name';
  assert.equal((await call()).status, 200); assert.equal(state.sends[0].body, state.sends[1].body);
  assert.equal(state.sends[0].headers['Idempotency-Key'], state.sends[1].headers['Idempotency-Key']);
});
test('uncertain deliveries beyond provider deduplication window require review', async () => {
  const { state, call } = setup(); state.ok = false; await call();
  state.row.first_attempt_at = new Date(Date.now() - 24 * 3600000).toISOString();
  await call(); assert.equal(state.row.status, 'needs_review'); assert.equal(state.sends.length, 1);
});
