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
    const records = await readAll(() => client.from('payments')
      .select('id,reference,is_test,payment_method,payment_type,event_id,checkout_source:metadata->>source,amount,currency,status,players!payments_player_id_fkey(name),calendar!payments_event_id_fkey(event_name)')
      .eq('payment_method', 'paystack').eq('is_test', test).in('reference', references).order('id'), controller.signal);
    return transactions.map(row => {
      const matches = records.filter(payment => payment.reference === row.reference && payment.is_test === test && payment.payment_method === 'paystack');
      const payment = matches.length === 1 ? matches[0] : null;
      const eventId = Number(payment?.event_id);
      return { ...row, link: payment ? { state: 'matched', paymentId: payment.id,
        savedEventCheckout: payment.payment_type === 'event_entry_fee' && payment.checkout_source === 'manual_event'
          && Number.isSafeInteger(eventId) && eventId > 0,
        playerName: payment.players?.name || null, eventName: payment.calendar?.event_name || null,
        comparison: compareGatewayRecord(row, payment) }
        : { state: matches.length > 1 ? 'ambiguous' : 'unmatched' } };
    });
  } catch {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    return transactions.map(row => ({ ...row, link: { state: 'unavailable' } }));
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}

export const gatewayLinkLabel = link => ({ matched: 'Exact 4M reference match', ambiguous: 'Multiple 4M records — review needed',
  unmatched: 'No matching payment in 4M', unavailable: '4M details could not be loaded' }[link?.state] || '4M details not checked');
