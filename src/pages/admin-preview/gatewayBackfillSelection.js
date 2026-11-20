import { loadGatewayLinks } from './gatewayLinks.js';
import { canReviewGatewayBackfill } from './paystackBackfill.js';

const matchBatchSize = 50;

export const canSelectGatewayBackfill = (session, permissions, scopeId) =>
  Boolean(session?.user?.id && permissions?.role === 'super_admin' && scopeId === 'all');

export async function selectMissingGatewayReceipts(client, session, permissions, scopeId, rows, signal) {
  if (!canSelectGatewayBackfill(session, permissions, scopeId)) throw new Error('Platform Finance access is required to review these receipts.');
  const candidates = rows.filter(row => row.environment === 'live' && row.status === 'success');
  const receipts = [];
  for (let offset = 0; offset < candidates.length; offset += matchBatchSize) {
    signal?.throwIfAborted();
    const linked = await loadGatewayLinks(client, session, permissions, scopeId, candidates.slice(offset, offset + matchBatchSize), signal);
    if (linked.some(row => row.link?.state === 'unavailable')) {
      throw new Error('4M ledger matches could not be checked for every result. Try the lookup again.');
    }
    receipts.push(...linked.filter(row => canReviewGatewayBackfill(session, permissions, scopeId, row)));
  }
  return receipts;
}
