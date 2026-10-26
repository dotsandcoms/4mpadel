import { canReadFinanceOverview } from './financeOverviewData.js';

const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : null;
const text = value => typeof value === 'string' || typeof value === 'number' ? String(value) : '';
// Recorded monetary evidence must not accept Number() coercions such as hex,
// exponent notation, booleans or precision that the UI would silently round.
export function recordedLineItemAmount(value) {
  if (!['number', 'string'].includes(typeof value) || String(value).length > 32 || !/^-?\d+(?:\.\d{1,2})?$/.test(String(value))) return null;
  const raw = String(value), negative = raw.startsWith('-'), [whole, fraction = ''] = raw.replace(/^-/, '').split('.');
  const exactCents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (exactCents > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  const amount = Number(value);
  const canonical = `${negative && exactCents !== 0n ? '-' : ''}${BigInt(whole)}.${fraction.padEnd(2, '0')}`;
  return Number.isFinite(amount) && amount.toLocaleString('en-US', { useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2 }) === canonical ? amount : null;
}
function parse(value, warnings, label) {
  if (value == null || value === '') return {};
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { warnings.push(`${label} is not valid JSON.`); return {}; } }
  if (!object(value)) { warnings.push(`${label} is not an object.`); return {}; }
  return value;
}

// Mirrors MAIN paystackMetadata: nested original_trx.metadata first, then outer
// values take precedence. This is evidence presentation, never classification by
// amount or authorisation to assign licences, reconcile a payment, or pay out.
export function paymentMetadataReview(value) {
  const warnings = [], outer = parse(value, warnings, 'Payment metadata');
  const meta = { ...parse(outer.original_trx?.metadata, warnings, 'Original transaction metadata'), ...outer };
  const list = (key, map) => {
    if (meta[key] == null) return [];
    if (!Array.isArray(meta[key])) { warnings.push(`${key.replaceAll('_', ' ')} is not a list.`); return []; }
    return meta[key].map((item, index) => {
      if (!object(item)) { warnings.push(`${key.replaceAll('_', ' ')} row ${index + 1} is malformed.`); return map({}); }
      return map(item);
    });
  };
  const covers = list('covers', row => ({ email: text(row.email), division: text(row.division), type: text(row.type), license: text(row.license), licenseYear: text(row.license_year), eventId: text(row.event_id) }));
  const lineItems = list('line_items', row => ({ type: text(row.type), player: text(row.player), paidBy: text(row.paid_by), amount: recordedLineItemAmount(row.amount) }));
  if (covers.some(row => !row.email || !['entry', 'license'].includes(row.type))) warnings.push('Some coverage rows have no recipient or an unrecognised type.');
  if (lineItems.some(row => row.amount == null)) warnings.push('Some line-item amounts are missing or invalid. Only safe decimal amounts with at most two decimal places are displayed.');
  return { warnings, covers, lineItems, source: text(meta.source), registrantEmail: text(meta.registrant_email), eventName: text(meta.event_name), eventId: text(meta.event_id), division: text(meta.division), paystackReference: text(meta.paystack_ref), originalReference: text(meta.original_trx?.id), classification: text(meta.payment_classification?.payment_type), inheritedCovers: meta.inherited_covers_from_sibling === true };
}

export async function loadPaymentMetadataReview(client, session, permissions, scopeId, paymentId, signal) {
  if (!canReadFinanceOverview(session, permissions, scopeId)) throw new Error('Platform Payments access is required.');
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  if (paymentId == null || String(paymentId).trim() === '') throw new Error('A payment ID is required.');
  let query = client.from('payments').select('id,reference,payment_type,metadata').eq('id', paymentId);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query.single();
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
  if (error || !data || String(data.id) !== String(paymentId)) throw new Error('The payment metadata could not be read. No reconciliation was performed.');
  return paymentMetadataReview(data.metadata);
}
