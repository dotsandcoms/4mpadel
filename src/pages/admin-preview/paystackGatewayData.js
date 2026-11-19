import { canReadFinanceOverview } from './financeOverviewData.js';

// Date inputs are South African calendar days; the gateway accepts UTC instants.
export function gatewayDateBounds(from = '', to = '') {
  const boundary = (value, end) => {
    if (!value) return undefined;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)
      || !Number.isFinite(Date.parse(`${value}T00:00:00.000Z`))
      || new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value) {
      throw new Error('Choose a valid date.');
    }
    return new Date(`${value}T${end ? '23:59:59.999' : '00:00:00.000'}+02:00`).toISOString();
  };
  const bounds = { from: boundary(from, false), to: boundary(to, true) };
  if (bounds.from && bounds.to && bounds.from > bounds.to) throw new Error('Start date must be before end date.');
  return bounds;
}

export async function loadGatewayPage(client, session, permissions, scopeId, {
  mode, page = 1, perPage = 50, from = '', to = '', status = '',
} = {}, signal) {
  if (!canReadFinanceOverview(session, permissions, scopeId)) throw new Error('Platform Payments access is required.');
  if (signal?.aborted) throw new DOMException('Request cancelled.', 'AbortError');
  if (!['live', 'test'].includes(mode)) throw new Error('Choose live or test mode.');
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isInteger(perPage) || perPage < 1 || perPage > 100) {
    throw new Error('Invalid gateway page.');
  }
  if (status && !['success', 'failed', 'abandoned'].includes(status)) throw new Error('Unsupported gateway status filter.');
  const bounds = gatewayDateBounds(from, to);
  const query = new URLSearchParams({ mode, page: String(page), perPage: String(perPage) });
  for (const [key, value] of Object.entries({ ...bounds, status })) if (value) query.set(key, value);
  // Read the current token, not a potentially stale render-time session token.
  const auth = await client.auth.getSession();
  if (signal?.aborted) throw new DOMException('Request cancelled.', 'AbortError');
  const current = auth.data?.session;
  if (auth.error || !current?.access_token || current.user?.id !== session.user.id) {
    throw new Error('Your session changed. Sign in again to view gateway transactions.');
  }
  const { data, error } = await client.functions.invoke(`paystack-preview-transactions?${query}`, {
    method: 'GET', headers: { Authorization: `Bearer ${current.access_token}` }, signal, timeout: 20000,
  });
  if (signal?.aborted) throw new DOMException('Request cancelled.', 'AbortError');
  if (error) {
    const code = error.context?.status;
    const messages = {
      401: 'Your session expired. Sign in again.',
      403: 'Platform super-admin access is required.',
      404: 'The gateway preview is not available in this environment yet.',
      503: 'The gateway preview is not configured or access could not be verified.',
      504: 'Paystack took too long to respond. Try again.',
    };
    throw new Error(messages[code] || 'Gateway transactions could not be loaded. Try again.');
  }
  const pagination = data?.pagination;
  if (data?.environment !== mode || !Array.isArray(data?.transactions)
    || pagination?.page !== page || pagination?.perPage !== perPage
    || !Number.isSafeInteger(pagination?.total) || pagination.total < 0
    || !Number.isSafeInteger(pagination?.pageCount) || pagination.pageCount < 0
    || pagination.hasMore !== (page < pagination.pageCount)
    || data.transactions.length > perPage
    || data.transactions.some(row => row.environment !== mode || !Number.isSafeInteger(row.amountMinor)
      || row.amountMinor < 0 || typeof row.currency !== 'string' || typeof row.reference !== 'string'
      || typeof row.status !== 'string')) {
    throw new Error('Gateway returned an unexpected response. No figures have been inferred.');
  }
  return data;
}
