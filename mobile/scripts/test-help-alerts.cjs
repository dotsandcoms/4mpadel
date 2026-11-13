const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
function load(file, dependencies = {}, extra = {}) {
 const result = { exports: {} };
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: result.exports, module: result, require: name => dependencies[name], Response, Request, URL, AbortSignal, fetch, console, ...extra });
 return result.exports;
}
const template = load('supabase/functions/deliver-help-alerts/template.ts');
const delivery = load('supabase/functions/deliver-help-alerts/delivery.ts', { './template.ts': template });
const sample = { id: '10000000-0000-0000-0000-000000000001', leaseId: 'lease-1', kind: 'escalated', requestId: '20000000-0000-0000-0000-000000000001', reference: '4M-2000000000', event: '<Event & court>', topic: 'payment', payload: null };
function fixture() {
 const state = { job: { ...sample }, queued: true, calls: [], sends: [], fail: false, stale: false, accepted: 0, keys: new Set() };
 const client = { rpc: async (_name, args) => {
  const action = args.p_action, data = args.p_data; state.calls.push({ action, data });
  if (action === 'claim') { if (!state.queued) return { data: [], error: null }; state.queued = false; return { data: [{ ...state.job }], error: null }; }
  if (action === 'prepare') { if (state.stale) return { data: null, error: null }; state.job.payload ||= data.payload; return { data: state.job.payload, error: null }; }
  if (action === 'finish') { state.queued = data.status === 'retry'; return { data: { saved: true }, error: null }; }
 } };
 const send = async (_url, options) => { state.sends.push(options); if (state.fail) return new Response('{}', { status: 503 }); const key = options.headers['Idempotency-Key']; if (!state.keys.has(key)) { state.keys.add(key); state.accepted++; } return new Response('{"id":"provider-1"}'); };
 const run = () => delivery.deliverHelpAlerts(client, { apiKey: 'test-only', sender: 'notifications.4mpadel.co.za' }, send);
 return { state, run, client, send };
}
test('support email targets the fixed 4M mailbox with an escaped event and authenticated ticket link', () => {
 const payload = template.supportAlertPayload(sample, 'notifications.4mpadel.co.za');
 assert.deepEqual(Array.from(payload.to), ['info@4mpadel.co.za']); assert.match(payload.html, /&lt;Event &amp; court&gt;/); assert.doesNotMatch(payload.html, /<Event/);
 assert.match(payload.text, /Payment or refund/); assert.match(payload.html, /admin\?tab=event-mgmt&amp;section=help&amp;ticket=20000000/);
 assert.throws(() => template.supportAlertPayload({ ...sample, requestId: 'https://untrusted.test' }, 'notifications.4mpadel.co.za'));
 assert.throws(() => template.supportSender('onboarding@resend.dev')); assert.throws(() => template.supportSender('sender@example.com\nBcc:other@example.com'));
});
test('successful delivery is recorded, with one email for simultaneous worker invocations', async () => {
 const { state, run } = fixture(); await Promise.all([run(), run()]);
 assert.equal(state.sends.length, 1); assert.equal(state.accepted, 1); assert.equal(state.calls.at(-1).data.status, 'sent');
});
test('a failed delivery retries the frozen payload with the same provider idempotency key', async () => {
 const { state, run } = fixture(); state.fail = true; await run(); const first = state.sends[0];
 assert.equal(state.calls.at(-1).data.status, 'retry'); state.job.event = 'Changed event'; state.fail = false; await run();
 assert.equal(state.sends[1].body, first.body); assert.equal(state.sends[1].headers['Idempotency-Key'], first.headers['Idempotency-Key']); assert.equal(state.accepted, 1);
});
test('stale leases and missing email configuration never send', async () => {
 const f = fixture(); f.state.stale = true; await f.run(); assert.equal(f.state.sends.length, 0);
 await assert.rejects(() => delivery.deliverHelpAlerts(f.client, { apiKey: '', sender: 'notifications.4mpadel.co.za' }, f.send));
});
test('the scheduler endpoint rejects untrusted and wrong-method callers before accessing jobs', async () => {
 let handler, claims = 0;
 load('supabase/functions/deliver-help-alerts/index.ts', { './delivery.ts': { deliverHelpAlerts: async () => { claims++; } }, 'npm:@supabase/supabase-js@2.95.3': { createClient() {} } }, { Deno: { serve: value => handler = value, env: { get: key => key === 'PUSH_WORKER_SECRET' ? 'test-scheduler-secret' : 'configured' } } });
 assert.equal((await handler(new Request('http://test', { method: 'POST' }))).status, 401);
 assert.equal((await handler(new Request('http://test', { headers: { Authorization: 'Bearer test-scheduler-secret' } }))).status, 405);
 assert.equal(claims, 0);
});

test('authenticated readiness checks validate mail configuration without claiming jobs or sending', async () => {
 let handler, calls=0;
 load('supabase/functions/deliver-help-alerts/index.ts',{'./delivery.ts':{deliverHelpAlerts:async()=>{calls++;}},'./template.ts':template,'npm:@supabase/supabase-js@2.95.3':{createClient(){calls++;}}},{Deno:{serve:value=>handler=value,env:{get:key=>key==='PUSH_WORKER_SECRET'?'test-scheduler-secret':key==='RESEND_VERIFIED_SENDER'?'notifications.4mpadel.co.za':'configured'}}});
 const response=await handler(new Request('https://test/?health=1',{method:'POST',headers:{Authorization:'Bearer test-scheduler-secret'}}));
 assert.equal(response.status,200);assert.equal((await response.json()).ready,true);assert.equal(calls,0);
});
