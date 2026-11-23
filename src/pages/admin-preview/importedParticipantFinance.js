import { calculateEventSettlement, loadEventCashVerification } from '../../utils/eventSettlement.js';
import { getPaymentMetadataLayers, isCompedEntryPayment, isLicensePaymentRow, normalizePaymentMetadata } from '../../utils/paymentRegistrationMatch.js';
import { filterEventParticipants, readEventParticipants } from './eventParticipants.js';
import { verifyEventOperationAccess } from './eventOperationAccess.js';

const id = value => String(value ?? '');
const norm = value => String(value ?? '').trim().toLowerCase();
const sameEvent = (row, eventId) => id(row.event_id) === id(eventId);
const cents = value => {
  if (value == null || value === '' || !/^\d+(?:\.\d{1,2})?$/.test(String(value))) return null;
  const result = Math.round(Number(value) * 100);
  return Number.isSafeInteger(result) ? result : null;
};

export async function verifyImportedFinanceAccess(options) {
  const { client, scopeId, signal } = options;
  const { user, event } = await verifyEventOperationAccess(options);
  if (event.is_manual === true || !user.email) return false;
  const request = (name, args) => {
    const query = client.rpc(name, args);
    return signal ? query.abortSignal(signal) : query;
  };
  const [active, platform] = await Promise.all([request('account_is_active'), request('is_super_admin', { user_email: user.email })]);
  signal?.throwIfAborted();
  if (active.error || active.data !== true) return false;
  if (!platform.error && platform.data === true) return true;
  if (!scopeId?.startsWith('org:')) return false;
  const owner = await request('is_organisation_admin', { p_organisation_id: event.organisation_id });
  signal?.throwIfAborted();
  return !owner.error && owner.data === true;
}

export async function loadImportedFinance(options) {
  const { client, eventId, signal } = options;
  if (!await verifyImportedFinanceAccess(options)) return null;
  const request = client.rpc('event_finance_overview_source', { p_event_ids: [Number(eventId)] });
  const { data, error } = await (signal ? request.abortSignal(signal) : request);
  signal?.throwIfAborted();
  if (error) throw error;
  if (!Array.isArray(data?.events) || data.events.length !== 1 || id(data.events[0].id) !== id(eventId)
    || data.events[0].is_manual === true || ['payments', 'participants', 'divisions'].some(key => !Array.isArray(data[key])
      || data[key].some(row => !sameEvent(row, eventId))) || !Array.isArray(data.refunds)) {
    throw new Error('Imported event finance records could not be verified.');
  }
  return { ...data, event: data.events[0] };
}

function uniqueIndex(rows, keyFor) {
  const result = new Map();
  for (const row of rows) {
    const key = keyFor(row);
    if (key) result.set(key, result.has(key) ? null : row);
  }
  return result;
}

const participantEmail = row => norm(row.email || row.players?.email);
const registrationLink = row => id(normalizePaymentMetadata(row.metadata).registration_id);
const coverKey = (email, division) => norm(email) && norm(division) ? `${norm(email)}\n${norm(division)}` : '';

function participantIndex(rows) {
  const active = rows.filter(row => row.is_test !== true);
  return {
    ids: uniqueIndex(active, row => id(row.id)),
    registrations: uniqueIndex(active, registrationLink),
    covers: uniqueIndex(active, row => coverKey(participantEmail(row), row.class_name)),
  };
}

function ownerRows(index, meta, covers) {
  if (meta.participant_id) {
    const row = index.ids.get(id(meta.participant_id));
    return row && (!meta.registration_id || registrationLink(row) === id(meta.registration_id)) ? [row] : [];
  }
  if (meta.registration_id) {
    const row = index.registrations.get(id(meta.registration_id));
    return row ? [row] : [];
  }
  return [...new Set(covers.filter(cover => cover.type === 'entry').map(cover => index.covers.get(coverKey(cover.email, cover.division))).filter(Boolean))];
}

function entryAmount(payment, row, covers, receiptCents) {
  const { top, inner } = getPaymentMetadataLayers(payment.metadata);
  const entryCovers = new Set(covers.filter(cover => cover.type === 'entry').map(cover => coverKey(cover.email, cover.division)));
  const lines = [...(Array.isArray(top.line_items) ? top.line_items : []), ...(Array.isArray(inner.line_items) ? inner.line_items : [])];
  const licenceLine = line => /licen[cs]e|\bsapa\b/i.test(`${line.type || ''} ${line.label || ''}`);
  const otherFee = covers.some(cover => cover.type === 'license') || lines.some(licenceLine);
  if (entryCovers.size < 2 && !otherFee) return receiptCents;
  const division = row.class_name;
  if (!division) return null;
  const prices = new Set([top.division_entry_fees?.[division], inner.division_entry_fees?.[division]].map(cents).filter(value => value !== null));
  for (const line of lines.filter(line => !licenceLine(line))) {
    const exactParticipant = line.participant_id && id(line.participant_id) === id(row.id);
    const exactRegistration = line.registration_id && registrationLink(row) === id(line.registration_id);
    const exactCover = coverKey(line.email, line.division) && coverKey(line.email, line.division) === coverKey(participantEmail(row), row.class_name);
    const amount = cents(line.amount);
    if ((exactParticipant || exactRegistration || exactCover) && amount !== null) prices.add(amount);
  }
  return prices.size === 1 ? [...prices][0] : null;
}

function importedCandidates(rows, payments, eventId) {
  const index = participantIndex(rows.filter(row => sameEvent(row, eventId)));
  return payments.flatMap(payment => {
    const meta = normalizePaymentMetadata(payment.metadata);
    if (!sameEvent(payment, eventId) || payment.payment_type !== 'event_entry_fee' || isLicensePaymentRow(payment)
      || payment.is_test === true || meta.is_test === true) return [];
    const { top, inner } = getPaymentMetadataLayers(meta);
    const covers = [top, inner].flatMap(layer => Array.isArray(layer.covers) ? layer.covers.filter(cover => cover && typeof cover === 'object') : []);
    const owners = ownerRows(index, meta, covers);
    return [{ payment, meta, covers, owners }];
  });
}

export function importedParticipantSettlement(event, rows, finance) {
  const candidates = importedCandidates(rows, finance.payments, event.id);
  const ids = uniqueIndex(rows, registrationLink);
  const paymentIds = new Set(finance.payments.map(payment => id(payment.id)));
  const refunds = finance.refunds.filter(row => !row.payment_id || paymentIds.has(id(row.payment_id)));
  const remapped = new Map(candidates.map(({ payment, meta, owners }) => [payment.id, {
    ...payment, metadata: owners.length === 1 && (meta.participant_id || meta.registration_id)
      ? { ...meta, registration_id: owners[0].id } : meta,
  }]));
  const registrations = rows.filter(row => sameEvent(row, event.id) && row.is_test !== true).map(row => ({
    ...row, email: participantEmail(row) || `participant:${row.id}`, status: normalizePaymentMetadata(row.metadata).status,
    division: row.class_name, payment_status: row.is_paid === true ? 'paid' : 'pending',
  }));
  return calculateEventSettlement({
    event: { ...event, ...finance.event }, registrations, divisions: finance.divisions,
    payments: finance.payments.map(payment => remapped.get(payment.id) || payment),
    refunds: refunds.map(row => ({ ...row, event_registration_id: ids.get(id(row.event_registration_id))?.id || row.event_registration_id })),
  });
}

export function verifiedImportedParticipantPayments(eventId, rows, payments, verification) {
  const gateway = new Map([...(verification?.receipts || []), ...(verification?.reversals || [])].filter(record => record.verified === true
    && record.currency === 'ZAR' && record.is_test !== true && cents(record.amount) !== null).map(record => [record.reference, record]));
  const groups = new Map();
  for (const { payment, meta, covers, owners } of importedCandidates(rows, payments, eventId)) {
    if (!owners.length || !['success', 'refunded'].includes(payment.status) || isCompedEntryPayment(payment)
      || (payment.currency && payment.currency !== 'ZAR')) continue;
    const amount = cents(payment.amount);
    if (amount == null) continue;
    const aliases = [meta.paystack_ref, ...(`${meta.note || ''} ${meta.payment_note || ''}`.match(/\bT\d{10,}\b/g) || [])].filter(Boolean);
    const provider = norm(payment.payment_method) === 'paystack' || aliases.length > 0;
    const matches = [...new Set([...aliases, payment.reference])].map(ref => gateway.get(ref)).filter(Boolean);
    if (provider && matches.length !== 1) continue;
    const receipt = matches[0];
    const available = receipt ? Math.min(amount, cents(receipt.amount)) : amount;
    const reference = receipt ? `provider:${receipt.reference}` : `ledger:${payment.reference || payment.id}`;
    const limit = receipt ? cents(receipt.amount) : amount;
    const allocations = owners.map(row => ({ row, amount: entryAmount(payment, row, covers, available) })).filter(item => item.amount !== null);
    if (allocations.reduce((value, item) => value + item.amount, 0) > available) continue;
    if (!groups.has(reference)) groups.set(reference, { limit, rows: new Map(), ambiguous: false });
    const group = groups.get(reference);
    for (const { row, amount } of allocations) {
      const previous = group.rows.get(row.id);
      if (previous && previous.amount !== amount) group.ambiguous = true;
      if (!previous) group.rows.set(row.id, { amount, method: receipt ? 'Paystack' : payment.payment_method || 'Recorded payment', note: meta.note || meta.payment_note || '' });
    }
  }
  const collected = new Map();
  for (const group of groups.values()) {
    if (group.ambiguous || [...group.rows.values()].reduce((value, row) => value + row.amount, 0) > group.limit) continue;
    for (const [rowId, record] of group.rows) {
      const totals = collected.get(rowId) || { cents: 0, methods: new Set(), notes: new Set() };
      totals.cents += record.amount;
      totals.methods.add(record.method);
      if (record.note) totals.notes.add(record.note);
      collected.set(rowId, totals);
    }
  }
  return collected;
}

export async function prepareImportedParticipantExport({ filters, ...options }) {
  const { client, eventId, signal } = options;
  const finance = await loadImportedFinance(options);
  if (!finance) throw new Error('Current event finance permission is required to export amounts.');
  const rows = await readEventParticipants(client, eventId, signal);
  const matched = filterEventParticipants(rows, eventId, filters);
  if (!matched.length) throw new Error('No participants match these filters.');
  const verification = await loadEventCashVerification(client, Number(eventId));
  signal?.throwIfAborted();
  if (!verification.complete) throw new Error('Paystack verification is incomplete. Retry the export after checking receipts.');
  if (!await verifyImportedFinanceAccess(options)) throw new Error('Current event finance permission is required to export amounts.');
  return { rows: matched, amounts: verifiedImportedParticipantPayments(eventId, rows, finance.payments, verification) };
}
