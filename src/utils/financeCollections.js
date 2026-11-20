import { fetchCommerceConfig, matchLicenseTypeByAmount } from './commerce.js';
import { buildEventSettlements, summarizeEventSettlements } from './eventSettlement.js';
import { fetchAllRows } from './fetchAllRows.js';
import { isLicensePaymentRow, normalizePaymentMetadata } from './paymentRegistrationMatch.js';

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const sum = rows => Math.round(rows.reduce((total, row) => total + Number(row.amount || 0), 0) * 100) / 100;
const yearMonth = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit' });

export function filterCollectionEvents(statements, filter, now = new Date()) {
  const currentMonth = yearMonth.format(now);
  return statements.filter(event => {
    const settlement = event.settlement;
    if (filter === 'outstanding') return settlement.dueToOrg > 0;
    if (filter === 'settled') return settlement.dueToOrg === 0 && !settlement.issues.length && !settlement.refundReserve;
    if (filter === 'month') return String(event.start_date || '').slice(0, 7) === currentMonth;
    return true;
  });
}

export function buildFinanceCollections({ events, registrations, participants, payments, refunds, divisions, commerce }, now = new Date()) {
  const statements = buildEventSettlements({ events, registrations, participants, payments, refunds, divisions });
  const receipts = statements.flatMap(event => event.settlement.receiptRows);
  const shares = statements.flatMap(event => event.settlement.allocations.flatMap(allocation => allocation.shares || []));
  const licences = payments.filter(payment => payment.status === 'success' && !payment.is_test
    && !normalizePaymentMetadata(payment.metadata).is_test && isLicensePaymentRow(payment));
  const licenceById = new Map(licences.map(payment => [payment.id, payment]));
  const licenceRefunds = [...new Map(refunds.filter(refund => refund.status === 'processed' && licenceById.has(refund.payment_id))
    .map(refund => [refund.paystack_refund_id || refund.id, refund])).values()];
  const full = payment => ['full_license', 'membership'].includes(payment.payment_type)
    || normalizePaymentMetadata(payment.metadata).license_type === 'full'
    || (!['temp_license', 'temporary_license'].includes(payment.payment_type)
      && matchLicenseTypeByAmount(Number(payment.amount), commerce) === 'full');
  const fullLicRev = sum(licences.filter(full)) - sum(licenceRefunds.filter(refund => full(licenceById.get(refund.payment_id))));
  const tempLicRev = sum(licences.filter(payment => !full(payment))) - sum(licenceRefunds.filter(refund => !full(licenceById.get(refund.payment_id))));
  const eventEntryRev = summarizeEventSettlements(statements).collected;
  const year = now.getFullYear();
  const monthly = months.map((name, index) => {
    const inMonth = value => {
      const date = new Date(value);
      return value && date.getFullYear() === year && date.getMonth() === index;
    };
    const entries = sum(shares.filter(share => inMonth(share.receipt.created_at)));
    const licenses = sum(licences.filter(payment => inMonth(payment.created_at)))
      - sum(licenceRefunds.filter(refund => inMonth(refund.processed_at || refund.created_at)));
    return { name, revenue: entries + licenses, entries, licenses };
  });
  return {
    statements, monthly, year, eventEntryRev, fullLicRev, tempLicRev, totalRevenue: eventEntryRev + fullLicRev + tempLicRev,
    totalTransactions: receipts.length + licences.length,
    activePlayers: new Set([
      ...registrations.filter(row => !['withdrawn', 'cancelled'].includes(row.status)).map(row => row.email),
      ...participants.map(row => row.email || row.players?.email),
    ].filter(Boolean).map(email => email.toLowerCase())).size,
  };
}

export async function loadFinanceCollections(client, eventIds, signal) {
  const read = (table, projection, eventColumn = '') => fetchAllRows(() => {
    signal?.throwIfAborted();
    let query = client.from(table).select(projection).order('id');
    if (eventColumn && eventIds.length) query = query.in(eventColumn, eventIds);
    return signal ? query.abortSignal(signal) : query;
  });
  const [payments, refunds, events, registrations, participants, divisions, commerce] = await Promise.all([
    read('payments', '*', 'event_id'),
    read('payment_refunds', '*'),
    read('calendar', '*', 'id'),
    read('event_registrations', '*', 'event_id'),
    read('tournament_participants', '*, players(email)', 'event_id'),
    read('tournament_divisions', '*', 'event_id'),
    fetchCommerceConfig(client).catch(() => null),
  ]);
  return buildFinanceCollections({ events, registrations, participants, payments, refunds, divisions, commerce });
}
