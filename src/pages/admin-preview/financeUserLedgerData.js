import { standaloneFinanceEventGrant } from './financeGrantScope.js';
import { verifyHostedReviewAccess } from './hostedReviewAccess.js';
import { readAll } from './playersData.js';

const profileFields = 'id,name,email';
const paymentFields = 'id,player_id,event_id,created_at,reference,payment_type,payment_method,status,amount,is_test,calendar(event_name)';
const batchSize = 50;

export function userLedgerScope(permissions, scopeId) {
  if (scopeId !== 'all') return null;
  if (permissions?.role === 'super_admin') return { mode: 'platform' };
  return standaloneFinanceEventGrant(permissions, 'users');
}

async function activeLedgerUser(client, expectedUserId, signal) {
  signal?.throwIfAborted();
  const auth = await client.auth.getUser();
  signal?.throwIfAborted();
  const user = auth.data?.user;
  if (auth.error || user?.id !== expectedUserId || !user?.email) throw new Error('Sign in again to open the User Ledger.');
  return user;
}

export async function requirePlatformLedger(client, expectedUserId, signal) {
  const user = await activeLedgerUser(client, expectedUserId, signal);
  const result = await client.rpc('is_super_admin', { user_email: user.email });
  signal?.throwIfAborted();
  if (result.error || result.data !== true) throw new Error('Platform super-admin access is required.');
}

async function resolveLedgerEvents(client, expectedUserId, scope, signal) {
  if (!scope) throw new Error('Current Finance User Ledger access is required.');
  if (scope.mode === 'platform') {
    await requirePlatformLedger(client, expectedUserId, signal);
    return null;
  }
  const user = await activeLedgerUser(client, expectedUserId, signal);
  const { permissions } = await verifyHostedReviewAccess(client, user, signal);
  const current = standaloneFinanceEventGrant(permissions, 'users');
  if (!current || current.mode !== scope.mode || (scope.mode === 'assigned'
    && JSON.stringify(current.assigned) !== JSON.stringify(scope.assigned))) {
    throw new Error('Your User Ledger access or assigned events changed. Reopen this report.');
  }
  if (current.mode === 'assigned') return current.assigned;
  const events = await readAll(() => client.from('calendar').select('id,finance_managed').eq('finance_managed', true).order('id'), signal);
  if (events.some(row => row.finance_managed !== true || !Number.isSafeInteger(Number(row.id)) || Number(row.id) <= 0)) {
    throw new Error('The Finance-managed events could not be verified.');
  }
  return [...new Set(events.map(row => Number(row.id)))];
}

async function readInBatches(ids, fetch) {
  const rows = [];
  for (let start = 0; start < ids.length; start += batchSize) rows.push(...await fetch(ids.slice(start, start + batchSize)));
  return rows;
}

export async function loadUserLedger(client, expectedUserId, scope, signal) {
  const eventIds = await resolveLedgerEvents(client, expectedUserId, scope, signal);
  const read = (table, fields, filter = query => query) =>
    readAll(() => filter(client.from(table).select(fields)).order('id'), signal);
  if (eventIds === null) {
    const [players, payments] = await Promise.all([read('players', profileFields), read('payments', paymentFields)]);
    return { players, payments, eventIds };
  }

  const payments = await readInBatches(eventIds, ids => read('payments', paymentFields, query => query.in('event_id', ids)));
  if (payments.some(row => !eventIds.includes(Number(row.event_id)))) throw new Error('User Ledger returned payments outside the verified events.');
  const playerIds = [...new Set(payments.map(row => row.player_id).filter(id => id != null))];
  const players = await readInBatches(playerIds, ids => read('players', profileFields, query => query.in('id', ids)));
  if (players.some(row => !playerIds.includes(row.id))) throw new Error('User Ledger returned profiles outside the verified payments.');
  const profiles = new Map(players.map(row => [row.id, row]));
  return { players: playerIds.map(id => profiles.get(id) || { id, name: `Player #${id}`, email: '' }), payments, eventIds };
}

export async function verifyUserLedgerExport(client, expectedUserId, scope, loadedEvents, signal) {
  const currentEvents = await resolveLedgerEvents(client, expectedUserId, scope, signal);
  if (loadedEvents !== null && (currentEvents === null || !loadedEvents.every(id => currentEvents.includes(id)))) {
    throw new Error('The Finance-managed events changed. Refresh the ledger before exporting.');
  }
}
