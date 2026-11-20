import { canReadPlatformPaystack } from './platformPaystack.js';
import { readAll } from './playersData.js';
import { compareGatewayRecord } from './gatewayComparison.js';

const identityFields = 'id,reference,is_test,payment_method,payment_type,client_reference:metadata->>client_reference';
const comparisonFields = `${identityFields},event_id,checkout_source:metadata->>source,verified_gateway_amount_minor:metadata->>verified_gateway_amount_minor,amount,currency,status,players!payments_player_id_fkey(name),calendar!payments_event_id_fkey(event_name)`;
const batchSize = 50;
export const gatewayReceiptTypeLabels = Object.freeze({ full:'Full licence', temporary:'Temporary licence', other:'Unclassified / other' });

const storedReceiptType = payment => {
  if (['full_license', 'membership'].includes(payment?.payment_type)) return 'full';
  if (['temp_license', 'temporary_license'].includes(payment?.payment_type)) return 'temporary';
  return 'other';
};

function checkTransactions(session, permissions, scopeId, transactions, signal) {
  if (!canReadPlatformPaystack(session, permissions, scopeId)) throw new Error('Platform Payments access is required.');
  const environment = transactions[0]?.environment;
  if (transactions.some(row => !['live','test'].includes(environment) || row.environment !== environment || !row.reference)) {
    throw new Error('Invalid gateway page.');
  }
  signal?.throwIfAborted();
}

async function lookupGatewayMatches(client, transactions, projection, signal) {
  const test = transactions[0].environment === 'test';
  const references = [...new Set(transactions.map(row => row.reference))];
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once:true });
  const timer = setTimeout(abort, 8000);
  try {
    const load = field => readAll(() => client.from('payments').select(projection)
      .eq('payment_method','paystack').eq('is_test',test).in(field, references).order('id'), controller.signal);
    const lists = await Promise.all([load('reference'), load('metadata->>client_reference')]);
    signal?.throwIfAborted();
    const records = [...new Map(lists.flat().map(payment => [payment.id,payment])).values()];
    const matches = new Map();
    for (const payment of records) {
      if (payment.is_test !== test || payment.payment_method !== 'paystack') continue;
      for (const reference of new Set([payment.reference,payment.client_reference])) {
        if (!references.includes(reference)) continue;
        if (!matches.has(reference)) matches.set(reference,[]);
        matches.get(reference).push(payment);
      }
    }
    return matches;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export async function loadGatewayReceiptTypes(client, session, permissions, scopeId, transactions, signal) {
  checkTransactions(session, permissions, scopeId, transactions, signal);
  const result = new Map();
  for (let offset = 0; offset < transactions.length; offset += batchSize) {
    signal?.throwIfAborted();
    const batch = transactions.slice(offset,offset + batchSize);
    let matches;
    try {
      matches = await lookupGatewayMatches(client,batch,identityFields,signal);
    } catch {
      signal?.throwIfAborted();
      throw new Error('Stored receipt types could not be verified. Try again or clear the receipt type filter.');
    }
    for (const row of batch) {
      const payments = matches.get(row.reference) || [];
      result.set(row.reference, storedReceiptType(payments.length === 1 ? payments[0] : null));
    }
  }
  return result;
}

export async function loadGatewayLinks(client, session, permissions, scopeId, transactions, signal) {
  checkTransactions(session, permissions, scopeId, transactions, signal);
  if (transactions.length > 100) throw new Error('Invalid gateway page.');
  if (!transactions.length) return [];
  try {
    const matchesByReference = await lookupGatewayMatches(client,transactions,comparisonFields,signal);
    return transactions.map(row => {
      const matches = matchesByReference.get(row.reference) || [];
      const payment = matches.length === 1 ? matches[0] : null;
      const eventId = Number(payment?.event_id);
      const recovered = payment?.checkout_source === 'admin_paystack_backfill';
      const gatewayMinor = Number(payment?.verified_gateway_amount_minor);
      const displayAmount = recovered && Number.isSafeInteger(gatewayMinor) && gatewayMinor > 0 ? gatewayMinor/100 : payment?.amount;
      return { ...row, link: payment ? { state: 'matched', paymentId: payment.id, recovered,
        gatewayAlias: payment.reference !== row.reference,
        savedEventCheckout: payment.payment_type === 'event_entry_fee' && payment.checkout_source === 'manual_event'
          && Number.isSafeInteger(eventId) && eventId > 0,
        playerName: payment.players?.name || null, eventName: payment.calendar?.event_name || null,
        comparison: compareGatewayRecord(row, { ...payment, amount:displayAmount }) }
        : { state: matches.length > 1 ? 'ambiguous' : 'unmatched' } };
    });
  } catch {
    signal?.throwIfAborted();
    return transactions.map(row => ({ ...row, link: { state: 'unavailable' } }));
  }
}

export const gatewayLinkLabel = link => link?.gatewayAlias ? 'Exact 4M gateway alias match' : ({ matched: 'Exact 4M reference match', ambiguous: 'Multiple 4M records — review needed',
  unmatched: 'No matching payment in 4M', unavailable: '4M details could not be loaded' }[link?.state] || '4M details not checked');
