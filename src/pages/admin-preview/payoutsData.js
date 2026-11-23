import { canReadFinanceOverview } from './financeOverviewData.js';
import { readAll } from './playersData.js';

// These are manually recorded organiser payments, not bank settlement receipts.
export async function loadRecordedPayouts(client, session, permissions, scopeId, signal, onProgress) {
  if (!canReadFinanceOverview(session, permissions, scopeId)) throw new Error('Platform Payouts access is required.');
  const events = await readAll(() => client.from('calendar')
    .select('id,event_name,organiser_name,organiser_interim_payments').order('id'), signal, onProgress);
  return normalizeRecordedPayouts(events);
}

function amountCents(value) {
  // Reject malformed and over-precision amounts rather than silently rounding.
  if (!['number', 'string'].includes(typeof value) || !/^\d+(?:\.\d{1,2})?$/.test(String(value))) return null;
  const cents = Math.round(Number(value) * 100);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export function normalizeRecordedPayouts(events) {
  const rows = [], issues = [];
  for (const event of events) {
    const payments = event.organiser_interim_payments;
    if (payments == null) continue;
    if (!Array.isArray(payments)) {
      issues.push({ eventId: event.id, eventName: event.event_name, message: 'Recorded organiser payments are not a list.' });
      continue;
    }
    const ids = new Map();
    payments.forEach(payment => { if (payment?.id != null) ids.set(String(payment.id), (ids.get(String(payment.id)) || 0) + 1); });
    payments.forEach((payment, index) => {
      const record = payment && typeof payment === 'object' && !Array.isArray(payment) ? payment : {};
      const cents = amountCents(record.amount);
      const warnings = [];
      if (cents == null) warnings.push('Invalid recorded amount');
      if (!validDate(record.paid_at)) warnings.push('Invalid or missing payment date');
      if (record.id == null || String(record.id).trim() === '') warnings.push('Missing record ID');
      else if (ids.get(String(record.id)) > 1) warnings.push('Duplicate record ID within event');
      rows.push({ key: `${event.id}:${index}`, eventId: event.id, eventName: event.event_name || 'Event name unavailable',
        organiserName: event.organiser_name || 'Organiser name unavailable', recordId: record.id == null ? null : String(record.id),
        amountCents: cents, paidAt: validDate(record.paid_at) ? record.paid_at : null,
        note: typeof record.note === 'string' ? record.note : '', warnings });
    });
  }
  // No inferred bank status, outstanding balance, or total over incomplete data.
  return { rows, issues };
}

export function filterRecordedPayouts(rows, { query = '', from = '', to = '', reviewOnly = false } = {}) {
  const needle = query.trim().toLowerCase();
  return rows.filter(row => (!reviewOnly || row.warnings.length > 0)
    && (!from || Boolean(row.paidAt && row.paidAt >= from)) && (!to || Boolean(row.paidAt && row.paidAt <= to))
    && (!needle || [row.eventName, row.organiserName, row.recordId, row.eventId, row.note].some(value => String(value ?? '').toLowerCase().includes(needle))))
    .sort((a, b) => (b.paidAt || '').localeCompare(a.paidAt || '') || a.key.localeCompare(b.key));
}
