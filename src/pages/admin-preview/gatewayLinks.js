import { canReadPlatformPaystack } from './platformPaystack.js';
import { readAll } from './playersData.js';
import { compareGatewayRecord } from './gatewayComparison.js';

export async function loadGatewayLinks(client, session, permissions, scopeId, transactions, signal) {
  if (!canReadPlatformPaystack(session, permissions, scopeId)) throw new Error('Platform Payments access is required.');
  const environment = transactions[0]?.environment;
  if (transactions.length > 100 || transactions.some(row => !['live', 'test'].includes(environment) || row.environment !== environment || !row.reference)) throw new Error('Invalid gateway page.');
  const test = environment === 'test';
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  if (!transactions.length) return [];
  const references = [...new Set(transactions.map(row => row.reference))];
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 8000);
  try {
    const loadMatches = field => readAll(() => client.from('payments')
      .select('id,reference,is_test,payment_method,payment_type,event_id,checkout_source:metadata->>source,client_reference:metadata->>client_reference,verified_gateway_amount_minor:metadata->>verified_gateway_amount_minor,amount,currency,status,players!payments_player_id_fkey(name),calendar!payments_event_id_fkey(event_name)')
      .eq('payment_method', 'paystack').eq('is_test', test).in(field, references).order('id'), controller.signal);
    const lists = await Promise.all([loadMatches('reference'), loadMatches('metadata->>client_reference')]);
    const records = [...new Map(lists.flat().map(payment => [payment.id,payment])).values()];
    return transactions.map(row => {
      const matches = records.filter(payment => (payment.reference === row.reference || payment.client_reference === row.reference)
        && payment.is_test === test && payment.payment_method === 'paystack');
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
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    return transactions.map(row => ({ ...row, link: { state: 'unavailable' } }));
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}

export const gatewayLinkLabel = link => link?.gatewayAlias ? 'Exact 4M gateway alias match' : ({ matched: 'Exact 4M reference match', ambiguous: 'Multiple 4M records — review needed',
  unmatched: 'No matching payment in 4M', unavailable: '4M details could not be loaded' }[link?.state] || '4M details not checked');
