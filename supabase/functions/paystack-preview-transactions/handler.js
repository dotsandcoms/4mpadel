const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};
const reply = (status, body) => new Response(JSON.stringify(body), { status, headers });

// Only the verified account email is used. Escape LIKE metacharacters so an
// email containing underscores or percent signs cannot match another account.
export async function hasPlatformAccess(client, email) {
  if (!email) return false;
  const pattern = email.trim().toLowerCase().replace(/[\\%_]/g, '\\$&');
  const { data, error } = await client.from('admin_sidebar_permissions')
    .select('role').ilike('email', pattern).maybeSingle();
  return !error && data?.role === 'super_admin';
}

function parameters(url) {
  const input = new URL(url).searchParams;
  const mode = input.get('mode');
  if (!['live', 'test'].includes(mode)) throw new Error('Choose live or test mode.');
  const integer = (name, fallback, max) => {
    const value = input.get(name) ?? String(fallback);
    if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > max) {
      throw new Error(`Invalid ${name}.`);
    }
    return Number(value);
  };
  const page = integer('page', 1, Number.MAX_SAFE_INTEGER);
  const perPage = integer('perPage', 50, 100);
  const query = new URLSearchParams({ page: String(page), perPage: String(perPage) });
  for (const key of ['from', 'to']) {
    const value = input.get(key);
    if (value) {
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
        || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
        throw new Error('Dates must be valid UTC ISO timestamps.');
      }
      query.set(key, value);
    }
  }
  if (query.has('from') && query.has('to') && query.get('from') > query.get('to')) {
    throw new Error('Start date must be before end date.');
  }
  const status = input.get('status');
  if (status) {
    if (!['success', 'failed', 'abandoned'].includes(status)) throw new Error('Invalid gateway status filter.');
    query.set('status', status);
  }
  return { mode, page, perPage, query };
}

export function createHandler({ authenticate, authorize, getSecret, fetchGateway = fetch, timeoutMs = 15000 }) {
  return async (request) => {
    if (request.method === 'OPTIONS') return reply(200, {});
    if (request.method !== 'GET') return reply(405, { error: 'Read-only endpoint. Use GET.' });
    const bearer = request.headers.get('authorization');
    if (!/^Bearer \S+$/i.test(bearer || '')) return reply(401, { error: 'Sign in to continue.' });
    try {
      const user = await authenticate(bearer);
      if (!user?.id || !user?.email) return reply(401, { error: 'Sign in to continue.' });
      if (!await authorize(user.email)) return reply(403, { error: 'Platform super-admin access required.' });
      let params;
      try { params = parameters(request.url); }
      catch (error) { return reply(400, { error: error.message }); }
      const secret = getSecret(params.mode);
      if (!secret || !secret.startsWith(`sk_${params.mode}_`)) {
        return reply(503, { error: 'This gateway environment is not configured.' });
      }
      const controller = new AbortController();
      const cancel = () => controller.abort();
      request.signal.addEventListener('abort', cancel, { once: true });
      if (request.signal.aborted) cancel();
      const timer = setTimeout(cancel, timeoutMs);
      try {
        const response = await fetchGateway(`https://api.paystack.co/transaction?${params.query}`, {
          method: 'GET', headers: { Authorization: `Bearer ${secret}` }, signal: controller.signal,
        });
        if (!response.ok) return reply(502, { error: 'Paystack could not load transactions. Try again.' });
        const body = await response.json();
        const meta = body.meta;
        if (body.status !== true || !Array.isArray(body.data) || !meta
          || ![meta.total, meta.pageCount].every(n => Number.isSafeInteger(n) && n >= 0)
          || meta.page !== params.page || meta.perPage !== params.perPage) {
          return reply(502, { error: 'Paystack returned an unexpected response.' });
        }
        const transactions = body.data.map(row => {
          if (!Number.isSafeInteger(row.amount) || row.amount < 0 || row.domain !== params.mode
            || typeof row.reference !== 'string' || typeof row.currency !== 'string'
            || typeof row.status !== 'string') throw new Error('Invalid transaction');
          // References avoid precision loss from Paystack's uint64 transaction IDs.
          // No metadata, authorization details or unrelated customer PII is exposed.
          return { reference: row.reference, amountMinor: row.amount, currency: row.currency,
            status: row.status, createdAt: row.created_at ?? null, paidAt: row.paid_at ?? null,
            channel: row.channel ?? null, environment: params.mode };
        });
        return reply(200, { transactions, pagination: { page: meta.page, perPage: meta.perPage,
          total: meta.total, pageCount: meta.pageCount, hasMore: meta.page < meta.pageCount },
        environment: params.mode });
      } catch {
        return reply(controller.signal.aborted ? 504 : 502, {
          error: controller.signal.aborted ? 'Gateway request timed out or was cancelled. Try again.' : 'Paystack returned an unexpected response.',
        });
      } finally {
        clearTimeout(timer);
        request.signal.removeEventListener('abort', cancel);
      }
    } catch {
      return reply(503, { error: 'Unable to verify access. Try again.' });
    }
  };
}
