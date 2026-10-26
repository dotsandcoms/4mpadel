import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { transform } from 'esbuild';

const source = (await fs.readFile('supabase/functions/send-email/index.ts', 'utf8')).replace(/^import .*;\n/gm, '');
const { code } = await transform(source, { loader: 'ts', format: 'cjs' });
const id = '20000000-0000-0000-0000-000000000001';
function fixture({ allowed = true, signedIn = true } = {}) {
    let handler;
    const deliveries = [], rpcs = [];
    const createClient = (_url, key, options) => ({
        auth: { getUser: async () => ({ data: { user: signedIn ? { id: 'owner', email: 'owner@example.test' } : null } }) },
        rpc: async (name, args) => {
            rpcs.push({ name, args, key, options });
            return allowed ? { data: { payoutRequestId: id, eventName: '<Unsafe event>', organiserName: 'Server Organisation', amountRequested: 1250, requestedAt: '2026-10-21' } } : { error: { message: 'MFA or access denied' } };
        },
        from: () => ({
            insert: () => ({ select: () => ({ maybeSingle: async () => ({ data: { id: 'queue' } }) }) }),
            update: () => ({ eq: async () => ({}) }),
        }),
    });
    vm.runInNewContext(code, {
        exports: {}, createClient, serve: fn => { handler = fn; }, Response, Request,
        console: { info() {}, warn() {}, error() {} },
        Deno: { env: { get: name => ({ SUPABASE_URL: 'https://project.test', SUPABASE_ANON_KEY: 'public-key', SUPABASE_SERVICE_ROLE_KEY: 'server-key', RESEND_API_KEY: 'email-key' })[name] } },
        fetch: async (_url, options) => { deliveries.push(JSON.parse(options.body)); return new Response('{"id":"email-1"}'); },
    });
    return { deliveries, rpcs, request: async variables => {
        const response = await handler(new Request('https://function.test', { method: 'POST', headers: { Authorization: 'Bearer user-jwt' }, body: JSON.stringify({ to: 'attacker@example.test', bcc: ['leak@example.test'], template: 'organiser_payout_request', variables }) }));
        return { status: response.status, data: await response.json() };
    } };
}
test('payout email requires a persisted request and forwards the user identity for backend MFA/access checks', async () => {
    const f = fixture({ allowed: false });
    assert.equal((await f.request({ eventName: 'fake', amountRequested: 123 })).status, 400);
    assert.equal((await f.request({ payoutRequestId: id })).status, 403);
    assert.equal(f.deliveries.length, 0);
    assert.equal(f.rpcs[0].key, 'public-key');
    assert.equal(f.rpcs[0].options.global.headers.Authorization, 'Bearer user-jwt');
    assert.equal(f.rpcs[0].args.p_action, 'notification');
});
test('payout notification ignores caller banking, amount, event, recipient and BCC and escapes stored names', async () => {
    const f = fixture();
    assert.equal((await f.request({ payoutRequestId: id, account_number: 'SECRET-ACCOUNT', account_holder: 'SECRET-HOLDER', eventName: 'FORGED-EVENT', amountRequested: 999999, html: 'FORGED-HTML' })).status, 200);
    const sent = f.deliveries[0];
    assert.deepEqual(sent.to, ['markstillerman@gmail.com']);
    assert.equal(sent.bcc, undefined);
    assert.match(sent.html, /Server Organisation/);
    assert.match(sent.html, /&lt;Unsafe event&gt;/);
    assert.equal(sent.html.includes('<Unsafe event>'), false);
    assert.equal(JSON.stringify(sent).includes('SECRET-'), false);
    assert.equal(JSON.stringify(sent).includes('FORGED-'), false);
    assert.match(sent.html, /Payments are made manually/);
});
test('unauthenticated payout notifications cannot send mail or access a request', async () => {
    const f = fixture({ signedIn: false });
    assert.equal((await f.request({ payoutRequestId: id })).status, 401);
    assert.equal(f.rpcs.length, 0);
    assert.equal(f.deliveries.length, 0);
});
