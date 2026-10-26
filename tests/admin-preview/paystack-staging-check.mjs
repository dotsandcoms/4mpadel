// Explicitly authorized temporary accounts; hard-pinned to the empty staging project.
// Never prints API keys, passwords, sessions, transaction rows or upstream bodies.
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { loadGatewayPage } from '../../src/pages/admin-preview/paystackGatewayData.js';
import { financeDate } from '../../src/pages/admin-preview/financeOverviewData.js';
const project = 'cefmzkwabdqqoagxhekc';
const url = `https://${project}.supabase.co`;
const keys = JSON.parse(execFileSync('supabase', ['projects', 'api-keys', '--project-ref', project, '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
const serviceKey = keys.find(key => key.name === 'service_role')?.api_key;
const anonKey = keys.find(key => key.name === 'anon')?.api_key;
if (!serviceKey || !anonKey) throw Error('Staging API keys unavailable');
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const created = [];
const cleanupErrors = [];
const check = (condition, label) => { if (!condition) throw Error(label); };
try {
  for (const role of ['super_admin', 'custom']) {
    const email = `gateway-qa-${randomUUID()}@example.invalid`;
    const password = `${randomUUID()}-aA1!`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    check(!error && data.user?.id, `Create ${role} account failed`);
    const account = { id: data.user.id, email };
    created.push(account);
    const grant = await admin.from('admin_sidebar_permissions').insert({ email, role, allowed_tabs: [], module_permissions: {} });
    check(!grant.error, `Create ${role} permission failed`);
    const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const signedIn = await client.auth.signInWithPassword({ email, password });
    check(!signedIn.error && signedIn.data.session?.access_token, `Sign-in ${role} failed`);
    const token = signedIn.data.session.access_token;
    const response = await fetch(`${url}/functions/v1/paystack-preview-transactions?mode=test&page=1&perPage=2`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(25000),
    });
    const body = await response.json();
    console.log(JSON.stringify({ role, httpStatus: response.status, error: body.error || body.code || null,
      rows: Array.isArray(body.transactions) ? body.transactions.length : null,
      pagination: body.pagination || null, environment: body.environment || null }));
    check(response.status === (role === 'super_admin' ? 200 : 403), `Unexpected ${role} access result`);
    if (role === 'super_admin') {
      check(body.environment === 'test', 'Environment mismatch');
      check(body.pagination?.perPage === 2, 'Page size mismatch');
      const session = signedIn.data.session;
      const permissions = { role: 'super_admin' };
      const pageRequest = options => loadGatewayPage(client, session, permissions, 'all', { mode: 'test', perPage: 2, ...options }, AbortSignal.timeout(25000));
      if (body.pagination.pageCount > 1) {
        const second = await pageRequest({ page: 2 });
        check(second.pagination.page === 2, 'Second-page metadata mismatch');
        check(!second.transactions.some(row => body.transactions.some(first => first.reference === row.reference)), 'Adjacent pages overlap; retry on stable gateway data');
        const last = await pageRequest({ page: body.pagination.pageCount });
        check(last.pagination.hasMore === false, 'Final page still reports more data');
        console.log('PASS: real client adapter, second page, final page and pagination metadata');
      }
      const successful = await pageRequest({ status: 'success' });
      check(successful.transactions.every(row => row.status === 'success'), 'Status filter returned a different status');
      const sampleDate = financeDate(body.transactions[0]?.createdAt);
      if (sampleDate) {
        const dated = await pageRequest({ from: sampleDate, to: sampleDate });
        check(dated.transactions.length > 0, 'Sample date unexpectedly returned no records');
        check(dated.transactions.every(row => financeDate(row.createdAt) === sampleDate), 'Date filter returned records outside the SA day');
        console.log('PASS: real status filter and South African date-window filter');
      }
      const secrets = JSON.parse(execFileSync('supabase', ['secrets', 'list', '--project-ref', project, '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
      if (!secrets.some(secret => secret.name === 'PAYSTACK_SECRET_KEY')) {
        let denied = false;
        try { await pageRequest({ mode: 'live' }); } catch (error) { denied = error.message.includes('not configured'); }
        check(denied, 'Unconfigured live mode was not denied');
        console.log('PASS: unconfigured live environment denied; no live gateway key present');
      } else console.log('SKIP: live-mode check because a live key exists; no live request made');
    }
  }
} finally {
  for (const account of created.reverse()) {
    const permission = await admin.from('admin_sidebar_permissions').delete().eq('email', account.email);
    const user = await admin.auth.admin.deleteUser(account.id);
    const remaining = await admin.from('admin_sidebar_permissions').select('email').eq('email', account.email);
    const remainingUser = await admin.auth.admin.getUserById(account.id);
    if (permission.error || user.error || remaining.error || remaining.data?.length || remainingUser.data?.user) {
      cleanupErrors.push({ id: account.id, email: account.email });
    }
  }
  console.log(JSON.stringify({ temporaryAccounts: created.length, cleanupVerified: cleanupErrors.length === 0, cleanupTargetsRequiringAttention: cleanupErrors }));
  if (cleanupErrors.length) throw Error('Temporary staging cleanup needs attention');
}
