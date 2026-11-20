import { fetchCommerceConfig } from '../../utils/commerce.js';
import { buildFinanceCollections } from '../../utils/financeCollections.js';
import { standaloneFinanceEventGrant } from './financeGrantScope.js';
import { readEventSource } from './financialSummaryData.js';
import { verifyHostedReviewAccess } from './hostedReviewAccess.js';
import { readAll } from './playersData.js';

const eventFields = 'id,event_name,start_date,finance_managed';
const eventBatchSize = 50;
const sourceBatchSize = 10;
const exactId = row => Number(row.id);

export function financeDashboardScope(permissions, scopeId) {
  return scopeId === 'all' ? standaloneFinanceEventGrant(permissions, 'dashboard') : null;
}

async function verifyDashboardGrant(client, expectedUserId, scope, signal) {
  if (!expectedUserId || !scope) throw new Error('Current Finance Dashboard access is required.');
  signal?.throwIfAborted();
  const auth = await client.auth.getUser();
  signal?.throwIfAborted();
  const user = auth.data?.user;
  if (auth.error || user?.id !== expectedUserId || !user?.email) throw new Error('Sign in again to open the Finance Dashboard.');
  const { permissions } = await verifyHostedReviewAccess(client, user, signal);
  const grant = financeDashboardScope(permissions, 'all');
  if (!grant || grant.mode !== scope.mode || (scope.mode === 'assigned'
    && JSON.stringify(grant.assigned) !== JSON.stringify(scope.assigned))) {
    throw new Error('Your Finance Dashboard access or assigned events changed. Reopen this report.');
  }
}

async function readBatches(ids, size, read) {
  const rows = [];
  for (let offset = 0; offset < ids.length; offset += size) rows.push(...await read(ids.slice(offset, offset + size)));
  return rows;
}

function readDashboardRows(client, table, fields, filter, signal) {
  return readAll(() => filter(client.from(table).select(fields)).order('id'), signal);
}

async function dashboardEvents(client, scope, signal, expectedIds = scope.assigned) {
  const read = filter => readDashboardRows(client, 'calendar', eventFields, filter, signal);
  const rows = expectedIds
    ? await readBatches(expectedIds, eventBatchSize, ids => read(query => {
      const selected = query.in('id', ids);
      return scope.mode === 'managed' ? selected.eq('finance_managed', true) : selected;
    }))
    : await read(query => query.eq('finance_managed', true));
  const ids = new Set(rows.map(exactId));
  if (rows.length !== ids.size || rows.some(row => !Number.isSafeInteger(exactId(row)) || exactId(row) <= 0
    || (expectedIds && !expectedIds.includes(exactId(row))) || (scope.mode === 'managed' && row.finance_managed !== true))) {
    throw new Error('Event records could not be verified for this Finance Dashboard.');
  }
  return rows;
}

export async function loadScopedFinanceDashboard(client, expectedUserId, scope, signal) {
  await verifyDashboardGrant(client, expectedUserId, scope, signal);
  const events = await dashboardEvents(client, scope, signal);
  if (scope.mode === 'assigned' && events.length !== scope.assigned.length) {
    throw new Error('One or more assigned events could not be verified. Refresh the dashboard.');
  }
  const ids = events.map(exactId);
  const sources = await readBatches(ids, sourceBatchSize, async batch => [await readEventSource(client, batch, signal)]);
  const readRecords = key => sources.flatMap(source => source[key]);
  const snapshots = new Map(readRecords('events').map(row => [exactId(row), row]));
  const participants = readRecords('participants');
  const profileIds = [...new Set(participants.filter(row => !row.email && row.profile_id != null).map(row => row.profile_id))];
  const profiles = await readBatches(profileIds, eventBatchSize, batch =>
    readDashboardRows(client, 'players', 'id,email', query => query.in('id', batch), signal));
  const emails = new Map(profiles.filter(row => profileIds.includes(row.id)).map(row => [row.id, row.email]));
  const commerce = ids.length ? await fetchCommerceConfig(client).catch(() => null) : null;

  await verifyDashboardGrant(client, expectedUserId, scope, signal);
  if (scope.mode === 'managed' && (await dashboardEvents(client, scope, signal, ids)).length !== ids.length) {
    throw new Error('The Finance-managed events changed while loading. Refresh the dashboard.');
  }
  return buildFinanceCollections({
    events:events.map(row => ({ ...row, ...snapshots.get(exactId(row)) })),
    registrations:readRecords('registrations'),
    participants:participants.map(row => ({ ...row, email:row.email || emails.get(row.profile_id) })),
    payments:readRecords('payments'), refunds:readRecords('refunds'), divisions:readRecords('divisions'), commerce,
  });
}
