import { loadGatewayLinks } from './gatewayLinks.js';
import { canReviewGatewayBackfill } from './paystackBackfill.js';

const matchBatchSize = 50;

export const canSelectGatewayBackfill = (session, permissions, scopeId) =>
  Boolean(session?.user?.id && permissions?.role === 'super_admin' && scopeId === 'all');

export async function selectMissingGatewayReceipts(client, session, permissions, scopeId, rows, signal) {
  if (!canSelectGatewayBackfill(session, permissions, scopeId)) throw new Error('Platform Finance access is required to review these receipts.');
  const candidates = rows.filter(row => row.environment === 'live' && row.status === 'success');
  if (!candidates.length) return [];
  signal?.throwIfAborted();
  const auth = await client.auth.getUser();
  const user = auth.data?.user;
  signal?.throwIfAborted();
  if (auth.error || !user?.email || user.id !== session.user.id) throw new Error('Your session changed. Sign in again to review these receipts.');
  const [active, access] = await Promise.all([
    client.rpc('account_is_active'), client.rpc('is_super_admin', { user_email:user.email }),
  ]);
  signal?.throwIfAborted();
  if (active.error || active.data !== true || access.error || access.data !== true) {
    throw new Error('Platform Finance access could not be verified. Reopen the gateway before reviewing missing receipts.');
  }
  const receipts = [];
  for (let offset = 0; offset < candidates.length; offset += matchBatchSize) {
    signal?.throwIfAborted();
    const linked = await loadGatewayLinks(client, session, permissions, scopeId, candidates.slice(offset, offset + matchBatchSize), signal);
    if (linked.some(row => row.link?.state === 'unavailable')) {
      throw new Error('4M ledger matches could not be checked for every result. Try the lookup again.');
    }
    receipts.push(...linked.filter(row => row.link?.state === 'unmatched' && canReviewGatewayBackfill(session, permissions, scopeId, row)));
  }
  return receipts;
}
