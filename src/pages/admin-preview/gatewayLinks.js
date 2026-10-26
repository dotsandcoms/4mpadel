import { canReadFinanceOverview } from './financeOverviewData.js';
import { readAll } from './playersData.js';
import { compareGatewayRecord } from './gatewayComparison.js';

export async function loadGatewayLinks(client, session, permissions, scopeId, transactions, signal) {
  if (!canReadFinanceOverview(session, permissions, scopeId)) throw new Error('Platform Payments access is required.');
  if (transactions.length > 100 || transactions.some(row => row.environment !== 'test' || !row.reference)) throw new Error('Invalid test gateway page.');
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  if (!transactions.length) return [];
  const references = [...new Set(transactions.map(row => row.reference))];
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, 8000);
  try {
    const records = await readAll(() => client.from('payments')
      .select('id,reference,is_test,payment_method,amount,currency,status,players!payments_player_id_fkey(name),calendar!payments_event_id_fkey(event_name)')
      .eq('payment_method', 'paystack').eq('is_test', true).in('reference', references).order('id'), controller.signal);
    return transactions.map(row => {
      const matches = records.filter(payment => payment.reference === row.reference && payment.is_test === true && payment.payment_method === 'paystack');
      return { ...row, link: matches.length === 1 ? { state: 'matched', paymentId: matches[0].id,
        playerName: matches[0].players?.name || null, eventName: matches[0].calendar?.event_name || null,
        comparison: compareGatewayRecord(row, matches[0]) }
        : { state: matches.length > 1 ? 'ambiguous' : 'unmatched' } };
    });
  } catch {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    return transactions.map(row => ({ ...row, link: { state: 'unavailable' } }));
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}

export const gatewayLinkLabel = link => ({ matched: 'Exact 4M reference match', ambiguous: 'Multiple 4M records — review needed',
  unmatched: 'No matching test payment in 4M', unavailable: '4M details could not be loaded' }[link?.state] || '4M details not checked');
