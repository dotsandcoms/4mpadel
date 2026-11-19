import { hasExplicitPlatformPaystackGrant, hasTenantMembership } from '../../../supabase/functions/_shared/admin-finance-access.mjs';
import { isEventCheckoutReference } from '../../utils/eventPaymentReference.js';
import { gatewayDateBounds } from './paystackGatewayData.js';

export function canReadPlatformPaystack(session, permissions, scopeId) {
  return Boolean(session?.user?.id && scopeId === 'all' && (permissions?.role === 'super_admin'
    || (!hasTenantMembership(permissions) && hasExplicitPlatformPaystackGrant(permissions))));
}

async function currentGatewayUser(client, session, signal) {
  signal?.throwIfAborted();
  const auth = await client.auth.getUser();
  signal?.throwIfAborted();
  if (!session?.user?.id || auth.error || auth.data?.user?.id !== session.user.id) {
    throw new Error('Your session changed. Sign in again to use Paystack.');
  }
}

export async function loadPlatformGatewayTransactions(client, session, permissions, scopeId, { mode, from, to }, signal) {
  if (!canReadPlatformPaystack(session, permissions, scopeId) || !['live', 'test'].includes(mode)) throw new Error('Platform Paystack access is required.');
  const query = new URLSearchParams({ mode });
  for (const [key, value] of Object.entries(gatewayDateBounds(from, to))) if (value) query.set(key, value);
  await currentGatewayUser(client, session, signal);
  const { data, error } = await client.functions.invoke(`paystack-transactions?${query}`, { method: 'GET', signal, timeout: 25000 });
  signal?.throwIfAborted();
  if (error?.context?.status === 403) throw new Error('The gateway denied access to this account.');
  if (error || data?.error || data?.mode !== mode || !Array.isArray(data.transactions)) throw new Error('Paystack transactions could not be verified. Try again.');
  const unique = new Set();
  return data.transactions.filter(raw => raw.is_test === (mode === 'test')).map(raw => {
    const reference = String(raw.id || '');
    const amountString = /^\s*R\s+([0-9,]+(?:\.[0-9]{1,2})?)\s*$/.exec(String(raw.amount || ''))?.[1];
    const amountMinor = amountString == null ? NaN : Math.round(Number(amountString.replaceAll(',', '')) * 100);
    const createdAt = raw.rawDate;
    if (!reference || unique.has(reference) || !Number.isSafeInteger(amountMinor) || amountMinor < 0 || !Number.isFinite(Date.parse(createdAt))) {
      throw new Error('Paystack returned an invalid transaction. Try again.');
    }
    unique.add(reference);
    return { reference, amountMinor, createdAt, status: String(raw.status || '').toLowerCase(),
      currency: 'ZAR', environment: mode, channel: raw.channel || '', payerEmail: raw.user || '' };
  });
}

export function canConfirmGatewayCheckout(row) {
  return row?.environment === 'live' && row.status === 'success' && row.link?.state === 'matched'
    && isEventCheckoutReference(row.reference);
}

export async function confirmGatewayCheckout(client, session, permissions, scopeId, row, signal) {
  if (!canReadPlatformPaystack(session, permissions, scopeId) || !canConfirmGatewayCheckout(row)) {
    throw new Error('Only a verified successful event checkout can be reconciled here.');
  }
  await currentGatewayUser(client, session, signal);
  const state = await client.rpc('event_checkout_state', { p_reference: row.reference });
  signal?.throwIfAborted();
  if (state.error || !['awaiting_payment', 'expired', 'paid', 'review'].includes(state.data?.state)) {
    throw new Error('The saved checkout is unavailable or access was revoked.');
  }
  const { data, error } = await client.functions.invoke('confirm-manual-payment', { body: { reference: row.reference }, signal, timeout: 30000 });
  if (error || data?.error) throw new Error('The gateway checkout could not be verified. Refresh the ledger before retrying.');
  if (data?.needsReview) return { status: 'review', message: data.message || 'Checkout requires registration review.' };
  if (data?.processed || data?.alreadyProcessed) return { status: 'done', message: data.alreadyProcessed ? 'Already reconciled.' : 'Checkout reconciled.' };
  throw new Error('This reference could not be reconciled by the event checkout service.');
}
