import { calculateEventSettlement } from '../../utils/eventSettlement.js';
import { isEntryFeeRefund, normalizePaymentMetadata } from '../../utils/paymentRegistrationMatch.js';
import { registrationFinanceAmounts } from '../../utils/registrationFinance.js';
import { financeDate, financeOverview, financeTypeEntries } from './financeOverviewData.js';
import { readAll } from './playersData.js';
import { standaloneFinanceSummary } from './access.js';
import { verifyHostedReviewAccess } from './hostedReviewAccess.js';

const EVENT_FIELDS = 'id,event_name,start_date,organisation_id,is_manual,finance_managed';
const PROFILE_FIELDS = 'id,name,email,license_type,paid_registration,approved';
const PAYMENT_FIELDS = 'id,player_id,event_id,amount,created_at,reference,payment_type,payment_method,status,is_test,metadata';
const REFUND_FIELDS = 'id,payment_id,event_registration_id,paystack_reference,amount,status,created_at,processed_at,metadata';
const id = value => String(value ?? '');
const norm = value => String(value ?? '').trim().toLowerCase();
const roleCanManage = row => ['admin', 'owner'].includes(row.member_role);
const unique = rows => [...new Map(rows.map(row => [id(row.id), row])).values()];
const eventIds = values => [...new Set((Array.isArray(values) ? values : []).filter(value => /^\d+$/.test(id(value)))
  .map(Number).filter(value => Number.isSafeInteger(value) && value > 0))].sort((a, b) => a - b);

export function financialSummaryScope(permissions, scopeId) {
  if (scopeId === 'all' && permissions?.role === 'super_admin') return { mode: 'platform', label: 'All 4M Padel' };
  if (scopeId?.startsWith('org:')) {
    const organisationId = scopeId.slice(4);
    const organisation = permissions?.orgs?.find(row => row.id === organisationId);
    if (organisationId && (permissions?.role === 'super_admin' || (organisation && roleCanManage(organisation)))) {
      return { mode: 'organisation', organisationId, label: organisation?.name || 'Organisation events' };
    }
  }
  return scopeId === 'all' ? standaloneFinanceSummary(permissions) : null;
}

export async function verifyFinancialSummaryAccess(client, expectedUserId, scope, signal) {
  signal?.throwIfAborted();
  if (!expectedUserId || !scope) throw new Error('Current Finance report access is required.');
  const auth = await client.auth.getUser();
  signal?.throwIfAborted();
  const user = auth.data?.user;
  if (auth.error || user?.id !== expectedUserId || !user.email) throw new Error('Sign in again to open Finance reports.');
  if (scope.mode === 'assigned' || scope.mode === 'managed') {
    // Recheck whether this is still a standalone account before report access.
    const { permissions } = await verifyHostedReviewAccess(client, user, signal);
    const current = standaloneFinanceSummary(permissions);
    if (scope.mode !== current?.mode || (scope.mode === 'assigned' && !scope.assigned.every(value => current.assigned.includes(value)))) {
      throw new Error('Your Finance summary access or assigned events changed. Reopen this report.');
    }
    return;
  }
  const active = await client.rpc('account_is_active');
  signal?.throwIfAborted();
  if (active.error || active.data !== true) throw new Error('An active account is required for Finance reports.');
  const platform = await client.rpc('is_super_admin', { user_email: user.email });
  signal?.throwIfAborted();
  if (platform.data === true && !platform.error) return;
  if (scope.mode === 'organisation') {
    const email = norm(user.email);
    const literal = email.replace(/[\\%_]/g, '\\$&');
    const members = await readAll(() => client.from('organisation_members').select('organisation_id,user_email,role')
      .eq('organisation_id', scope.organisationId).ilike('user_email', literal).order('user_email'), signal);
    signal?.throwIfAborted();
    if (members.some(row => row.organisation_id === scope.organisationId && norm(row.user_email) === email
      && ['owner', 'admin'].includes(row.role))) return;
  }
  throw new Error('Current Finance report access is required for this workspace.');
}

async function readBatches(ids, size, read) {
  const rows = [];
  for (let offset = 0; offset < ids.length; offset += size) rows.push(...await read(ids.slice(offset, offset + size)));
  return rows;
}

function readReportRows(client, table, fields, signal, filter = query => query) {
  return readAll(() => filter(client.from(table).select(fields)).order('id'), signal);
}

async function readEventSource(client, ids, signal) {
  let request = client.rpc('event_finance_overview_source', { p_event_ids: ids });
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request;
  signal?.throwIfAborted();
  if (error) throw error;
  const matches = row => ids.includes(Number(row.event_id));
  if (!Array.isArray(data?.events) || data.events.length !== ids.length || new Set(data.events.map(row => Number(row.id))).size !== ids.length
    || data.events.some(row => !ids.includes(Number(row.id))) || ['payments', 'registrations', 'participants', 'divisions'].some(key =>
      !Array.isArray(data[key]) || data[key].some(row => !matches(row))) || !Array.isArray(data.refunds)) {
    throw new Error('The event finance records could not be verified for this scope.');
  }
  return { ...data, licenses: (data.licenses || []).filter(matches) };
}

function refundLinks(refunds, payments) {
  const byId = new Map(payments.map(row => [id(row.id), row]));
  const byReference = new Map();
  for (const payment of payments) {
    const metadata = normalizePaymentMetadata(payment.metadata);
    for (const reference of new Set([payment.reference, metadata.paystack_ref].filter(Boolean))) {
      byReference.set(reference, byReference.has(reference) ? null : payment);
    }
  }
  return refunds.map(refund => ({ refund, payment: refund.payment_id ? byId.get(id(refund.payment_id)) : byReference.get(refund.paystack_reference) }));
}

export async function loadFinancialSummary({ client, expectedUserId, scope, signal }) {
  await verifyFinancialSummaryAccess(client, expectedUserId, scope, signal);
  const read = (table, fields, filter) => readReportRows(client, table, fields, signal, filter);
  const platform = scope.mode === 'platform';
  const [events, global] = await Promise.all([
    scope.mode === 'assigned' ? readBatches(scope.assigned, 50, ids => read('calendar', EVENT_FIELDS, query => query.in('id', ids)))
      : read('calendar', EVENT_FIELDS, query => filterFinanceEvents(query, scope)),
    platform ? Promise.all([read('players', PROFILE_FIELDS), read('payments', PAYMENT_FIELDS), read('payment_refunds', REFUND_FIELDS)]) : null,
  ]);
  if (events.some(row => !financeScopeIncludes(row, scope))) {
    throw new Error('The calendar returned records outside this Finance workspace.');
  }
  const ids = eventIds(events.map(row => row.id));
  const sources = await readBatches(ids, 10, async batch => [await readEventSource(client, batch, signal)]);
  const payments = unique(global?.[1] || sources.flatMap(source => source.payments));
  const refunds = unique(global?.[2] || sources.flatMap(source => source.refunds));
  const authorisedRefunds = platform ? refunds : refundLinks(refunds, payments).filter(row => row.payment).map(({ refund }) => refund);
  const profileIds = eventIds([...payments.map(row => row.player_id), ...sources.flatMap(source => source.participants.map(row => row.profile_id))]);
  const scopedProfiles = new Set(profileIds);
  const rosterEmails = [...new Set(sources.flatMap(source => source.registrations.map(row => String(row.email || '').trim())).filter(Boolean))];
  const scopedEmails = new Set(rosterEmails.map(norm));
  const exactEmails = [...new Set([...rosterEmails, ...scopedEmails])];
  const players = global?.[0] || unique((await Promise.all([
    readBatches(profileIds, 50, batch => read('players', PROFILE_FIELDS, query => query.in('id', batch))),
    readBatches(exactEmails, 50, batch => read('players', PROFILE_FIELDS, query => query.in('email', batch))),
  ])).flat().filter(row => scopedProfiles.has(Number(row.id)) || scopedEmails.has(norm(row.email))));
  signal?.throwIfAborted();
  const summary = buildFinancialSummary({ scope, events, sources, payments, refunds: authorisedRefunds, players });
  await verifyFinancialSummaryScope({ client, expectedUserId, scope, signal, reports: summary.reports });
  return summary;
}

const indexGroup = (rows, key) => {
  const groups = new Map();
  for (const row of rows) {
    const value = key(row);
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(row);
  }
  return groups;
};
const roundedAmount = value => Math.round((value + Number.EPSILON) * 100) / 100;
const eventDay = value => String(value || '').slice(0, 10);
const isTest = row => row.is_test === true || normalizePaymentMetadata(row.metadata).is_test === true;
const licenceLabel = value => value === 'full' ? 'Full licence' : ['temp', 'temporary'].includes(value) ? 'Temporary licence' : value === 'none' ? 'No licence' : 'Not recorded';
const entryActivity = row => norm(row.status) === 'withdrawn' ? 'Withdrawn' : norm(row.status) === 'cancelled' ? 'Cancelled' : '';

function entryStatus(row, amounts) {
  if (entryActivity(row)) return entryActivity(row);
  if (amounts?.comped) return 'Complimentary';
  if (amounts?.refundPending > 0) return 'Refund pending';
  if (row.payment_status === 'refunded') return 'Refunded';
  const received = (amounts?.paidTo4M || 0) + (amounts?.paidDirectToOrganiser || 0) + (amounts?.recipientUnconfirmed || 0);
  if (received > 0 && !amounts.outstanding) return 'Paid';
  if (received > 0) return 'Part paid';
  return row.payment_status === 'paid' ? 'Recorded paid' : 'Unpaid';
}

function eventReports(events, sources, players) {
  const profiles = new Map(players.map(row => [id(row.id), row]));
  const reports = [];
  for (const source of sources) {
    const payments = indexGroup(source.payments, row => id(row.event_id));
    const registrations = indexGroup(source.registrations, row => id(row.event_id));
    const participants = indexGroup(source.participants, row => id(row.event_id));
    const divisions = indexGroup(source.divisions, row => id(row.event_id));
    const eligibility = new Map((source.licenses || []).map(row => [`${row.event_id}:${row.identity}`, row.eligibility]));
    const linkedRefunds = refundLinks(source.refunds, source.payments);
    for (const record of source.events) {
      const event = { ...events.get(id(record.id)), ...record };
      const key = id(event.id);
      const raw = event.is_manual ? registrations.get(key) || [] : (participants.get(key) || []).map(row => ({
        ...row, division: row.class_name, email: row.email || profiles.get(id(row.profile_id))?.email,
        payment_status: row.is_paid ? 'paid' : 'pending',
      }));
      const entries = raw.filter(row => !isTest(row));
      const registeredIds = new Set(entries.map(row => id(row.id)));
      const scopedPayments = (payments.get(key) || []).map(payment => {
        const metadata = normalizePaymentMetadata(payment.metadata);
        if (!event.is_manual && metadata.participant_id && registeredIds.has(id(metadata.participant_id))) {
          return { ...payment, metadata: { ...metadata, registration_id: id(metadata.participant_id) } };
        }
        return payment;
      });
      const scopedRefunds = linkedRefunds.filter(({ refund, payment }) => payment ? id(payment.event_id) === key
        : !refund.payment_id && registeredIds.has(id(refund.event_registration_id))).map(({ refund }) => refund);
      const settlement = calculateEventSettlement({ event, divisions: divisions.get(key), payments: scopedPayments, refunds: scopedRefunds,
        registrations: entries.map(row => ({ ...row, email: row.email || `participant:${row.id}` })) });
      const allocated = new Map(settlement.allocations.map(row => [id(row.registration.id), registrationFinanceAmounts(row)]));
      const history = indexGroup(settlement.processedRefundRows.filter(row => isEntryFeeRefund(row, row.receipt)), row => id(row.event_registration_id));
      const rows = entries.flatMap(row => {
        const amounts = allocated.get(id(row.id));
        if (!amounts && !entryActivity(row)) return []; // Duplicate active enrolment never receives another allocation.
        const profile = profiles.get(id(row.profile_id));
        const licence = eligibility.get(`${key}:${event.is_manual ? norm(row.email) : row.profile_id}`);
        const refunded = amounts?.refunded ?? (history.get(id(row.id)) || []).reduce((total, item) => total + item.amount, 0);
        const net = amounts ? roundedAmount(amounts.paidTo4M + amounts.paidDirectToOrganiser + amounts.recipientUnconfirmed) : 0;
        return [{ id: `${key}:${row.id}`, eventId: event.id, event: event.event_name || `Event ${key}`, name: row.full_name || profile?.name || 'Unnamed participant',
          email: row.email || profile?.email || '', division: row.division || '', status: entryStatus(row, amounts),
          licence: licenceLabel(licence ? licence.full ? 'full' : licence.temporary ? 'temp' : 'none' : ''),
          billed: amounts?.entryAmount ?? 0, net, outstanding: amounts?.outstanding ?? 0, refunded: roundedAmount(refunded), reserve: amounts?.refundPending ?? 0 }];
      });
      reports.push({ event, rows, settlement });
    }
  }
  return reports.sort((a, b) => eventDay(b.event.start_date).localeCompare(eventDay(a.event.start_date)) || Number(a.event.id) - Number(b.event.id));
}

export function buildFinancialSummary({ scope, events, sources, players, payments, refunds }) {
  const eventById = new Map(events.map(row => [id(row.id), row]));
  const playersById = new Map(players.map(row => [id(row.id), row]));
  const livePayments = payments.filter(row => !isTest(row));
  const links = refundLinks(refunds, livePayments);
  const scopedRefunds = links.filter(row => row.payment).map(({ refund, payment }) => ({ ...refund, payment_id: payment.id }));
  const overview = financeOverview(livePayments, scopedRefunds);
  const amounts = indexGroup(financeTypeEntries(livePayments, scopedRefunds, null), row => id(row.paymentId));
  const byPlayer = indexGroup(livePayments, row => id(row.player_id));
  const playerRows = players.map(player => {
    const receipts = byPlayer.get(id(player.id)) || [];
    const entries = receipts.flatMap(row => amounts.get(id(row.id)) || []);
    const gross = entries.filter(row => row.kind === 'Receipt').reduce((total, row) => total + row.amount, 0);
    const refunded = -entries.filter(row => row.kind === 'Refund').reduce((total, row) => total + row.amount, 0);
    return { id: player.id, name: player.name || 'Unnamed player', email: player.email || '', licence: licenceLabel(player.license_type),
      status: player.paid_registration ? 'Paid / active' : 'Inactive', setup: player.approved ? 'Approved' : 'Pending', gross, refunds: refunded, net: gross - refunded };
  }).sort((a, b) => a.name.localeCompare(b.name) || id(a.id).localeCompare(id(b.id)));
  const transactionRow = (kind, row, payment) => ({ id: `${kind}:${row.id}`, kind, date: financeDate(row.processed_at || row.created_at),
    reference: kind === 'Payment' ? row.reference : row.paystack_reference || payment?.reference,
    player: playersById.get(id(payment?.player_id))?.name || '', event: eventById.get(id(payment?.event_id))?.event_name || '',
    type: payment?.payment_type || '', method: payment?.payment_method || '', amount: row.amount,
    status: row.status, included: kind === 'Payment' ? row.status === 'success' : payment?.status === 'success' && row.status != null && row.status !== 'failed',
  });
  const transactions = [...livePayments.map(row => transactionRow('Payment', row, row)),
    ...links.filter(({ payment, refund }) => payment || (!refund.payment_id && scope.mode === 'platform')).map(({ refund, payment }) => transactionRow('Refund', refund, payment))]
    .sort((a, b) => id(b.date).localeCompare(id(a.date)) || a.id.localeCompare(b.id));
  const reports = eventReports(eventById, sources, players);
  const entries = reports.flatMap(report => report.rows).sort((a, b) => a.name.localeCompare(b.name) || a.event.localeCompare(b.event));
  return { scope, overview, players: playerRows, entries, reports, transactions };
}

export function filteredFinancialSummary(data, view, query) {
  const search = norm(query);
  const rows = view === 'players' ? data.players : data.entries;
  return rows.filter(row => [row.name, row.email, row.event, row.division].some(value => norm(value).includes(search)));
}

export async function verifyFinancialSummaryScope({ client, expectedUserId, scope, signal, reports }) {
  await verifyFinancialSummaryAccess(client, expectedUserId, scope, signal);
  if (scope.mode === 'platform') return;
  const ids = eventIds(reports.map(report => report.event.id));
  const visible = await readBatches(ids, 50, batch => readReportRows(client, 'calendar', 'id,organisation_id,finance_managed', signal,
    query => filterFinanceEvents(query.in('id', batch), scope)));
  if (visible.length !== ids.length || new Set(visible.map(row => Number(row.id))).size !== ids.length
    || visible.some(row => !ids.includes(Number(row.id)) || !financeScopeIncludes(row, scope))) {
    throw new Error('The Finance event scope changed. Refresh the report to check your current access.');
  }
}

function filterFinanceEvents(query, scope) {
  if (scope.mode === 'organisation') return query.eq('organisation_id', scope.organisationId);
  if (scope.mode === 'managed') return query.eq('finance_managed', true);
  return query;
}

function financeScopeIncludes(event, scope) {
  if (scope.mode === 'organisation') return event.organisation_id === scope.organisationId;
  if (scope.mode === 'managed') return event.finance_managed === true;
  if (scope.mode === 'assigned') return scope.assigned.includes(Number(event.id));
  return scope.mode === 'platform';
}
