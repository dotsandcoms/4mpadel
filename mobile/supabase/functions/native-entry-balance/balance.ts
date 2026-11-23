const norm = (v: unknown) => String(v || '').trim().toLowerCase();
const cents = (v: unknown) => Math.round(Number(v) * 100);

type EntryCover = { type?: string; email?: string; division?: string; event_id?: number | string; registration_id?: string; division_id?: string };
type EntryTransfer = { cover_position: number; event_id: number | string; registration_id: string; email?: string; division?: string; division_id?: string | null };
type BalanceRegistration = { id: string; email: string; event_id?: number | string; division: string; division_id?: string | null; payment_status?: string | null };
type PaymentMetadata = {
  covers?: EntryCover[];
  verified_entry_transfers?: EntryTransfer[];
  verified_division_switch?: {
    registration_id: string;
    event_id: number | string;
    division_id: string;
    from_division_id: string;
    amount: number | string;
  };
  verified_entry_switch_refunds?: { registration_id: string; event_id: number | string; division_id: string; amount: number | string }[];
  is_test?: boolean;
  division_entry_fees?: Record<string, number | string | null>;
  source?: string;
  registration_id?: string;
  division?: string;
  verified_balance?: boolean;
};

function parseMetadata(value: unknown): PaymentMetadata {
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return {}; }
  }
  return value && typeof value === 'object' ? value as PaymentMetadata : {};
}

/** A transferred slot consumes the original cover and retains its recorded price. */
function findEntryCover(metadata: PaymentMetadata, reg: BalanceRegistration, eventId: unknown, paymentEventId: unknown) {
  const transfers = Array.isArray(metadata.verified_entry_transfers) ? metadata.verified_entry_transfers : [];
  const byPosition = new Map(transfers.filter(Boolean).map(transfer => [Number(transfer.cover_position), transfer]));
  let position = 0;
  for (const cover of Array.isArray(metadata.covers) ? metadata.covers : []) {
    if (cover?.type !== 'entry') continue;
    const transfer = byPosition.get(++position);
    if (String(cover.event_id ?? paymentEventId ?? eventId) !== String(eventId)) continue;
    if (transfer) {
      if (transfer.cover_position === position && reg.id && transfer.registration_id === reg.id
        && eventId != null && String(transfer.event_id) === String(eventId)
        && norm(reg.email) && (transfer.email === undefined || norm(transfer.email) === norm(reg.email))
        && (transfer.division_id ? transfer.division_id === reg.division_id : transfer.division === reg.division)) return cover;
      continue;
    }
    if ((!cover.registration_id || cover.registration_id === reg.id) && norm(cover.email) === norm(reg.email)
      && (cover.division_id && reg.division_id ? cover.division_id === reg.division_id : cover.division === reg.division)) return cover;
  }
}

/** Entry credit only: never treat a partner's fee, licence or service fee as this player's payment. */
export function entryBalance(event: any, division: any, reg: BalanceRegistration, payments: any[]) {
  let fee = Number(division?.entry_fee ?? event.entry_fee ?? 0);
  let original: number | null = null, additions = 0, switchAdditions = 0, switchRefunds = 0;
  const eventId = reg.event_id ?? event.id;
  for (const payment of payments) {
    if (payment.status !== 'success' || payment.is_test === true) continue;
    const metadata = parseMetadata(payment.metadata);
    if (metadata.source === 'division_switch') {
      const allocation = metadata.verified_division_switch;
      const amount = Number(payment.amount);
      if (payment.payment_type === 'event_entry_fee' && payment.payment_method === 'paystack' && !metadata.is_test
        && allocation?.registration_id === reg.id && allocation.from_division_id && allocation.division_id
        && allocation.division_id === reg.division_id && eventId != null && allocation.event_id != null
        && String(payment.event_id) === String(eventId) && String(allocation.event_id) === String(eventId)
        && Number.isFinite(amount) && amount > 0 && Number(allocation.amount) === amount) switchAdditions += cents(amount);
      continue;
    }
    if (metadata.source === 'native_entry_balance') {
      if (metadata.registration_id === reg.id && metadata.division === reg.division && metadata.verified_balance === true
        && String(payment.event_id ?? eventId) === String(eventId)) additions += cents(payment.amount);
      continue;
    }
    const cover = findEntryCover(metadata, reg, eventId, payment.event_id);
    if (!cover?.division) continue;
    const rebates = Array.isArray(metadata.verified_entry_switch_refunds) ? metadata.verified_entry_switch_refunds : [];
    for (const rebate of rebates) {
      if (rebate?.registration_id === reg.id && reg.division_id && rebate.division_id === reg.division_id
        && String(rebate.event_id) === String(eventId) && Number(rebate.amount) > 0
        && Number.isSafeInteger(cents(rebate.amount))) switchRefunds += cents(rebate.amount);
    }
    const value = metadata.division_entry_fees?.[cover.division];
    if (value != null && Number.isFinite(Number(value)) && Number(value) >= 0) original = Math.max(original ?? 0, cents(value));
  }
  // Expiry of an advertised early-bird offer must not create a retrospective debt.
  if (event.early_bird_ends_at && event.early_bird_fee != null) {
    if (new Date(event.early_bird_ends_at).getTime() > Date.now()) fee = Number(event.early_bird_fee);
    else if (original === cents(event.early_bird_fee)) fee = Math.max(0, original + switchAdditions - switchRefunds) / 100;
  }
  // Old/manual payments without an itemised allocation are not guessed.
  const known = original !== null || reg.payment_status !== 'paid' || fee === 0;
  const paid = Math.max(0, (original ?? 0) + additions + switchAdditions - switchRefunds);
  return { registrationId: reg.id, division: reg.division, known, paid: known ? paid / 100 : null, price: fee, due: known ? Math.max(0, cents(fee) - paid) / 100 : null };
}
