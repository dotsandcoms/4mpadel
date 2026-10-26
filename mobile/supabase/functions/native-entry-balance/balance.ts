const norm = (v: unknown) => String(v || '').trim().toLowerCase();
const cents = (v: unknown) => Math.round(Number(v) * 100);
/** Entry credit only: never treat a partner's fee, licence or service fee as this player's payment. */
export function entryBalance(event: any, division: any, reg: any, payments: any[]) {
  let fee = Number(division?.entry_fee ?? event.entry_fee ?? 0);
  let original: number | null = null, additions = 0;
  for (const p of payments) {
    if (p.status !== 'success' || p.is_test === true) continue;
    const m = typeof p.metadata === 'string' ? JSON.parse(p.metadata) : p.metadata || {};
    if (m.source === 'native_entry_balance') {
      if (m.registration_id === reg.id && m.division === reg.division && m.verified_balance === true) additions += cents(p.amount);
      continue;
    }
    const covered = (m.covers || []).some((c: any) => c.type === 'entry' && norm(c.email) === norm(reg.email) && c.division === reg.division);
    if (!covered) continue;
    const value = m.division_entry_fees?.[reg.division];
    if (value != null && Number.isFinite(Number(value)) && Number(value) >= 0) original = Math.max(original ?? 0, cents(value));
  }
  // Expiry of an advertised early-bird offer must not create a retrospective debt.
  if (event.early_bird_ends_at && event.early_bird_fee != null) {
    if (new Date(event.early_bird_ends_at).getTime() > Date.now()) fee = Number(event.early_bird_fee);
    else if (original === cents(event.early_bird_fee)) fee = original / 100;
  }
  // Old/manual payments without an itemised allocation are not guessed.
  const known = original !== null || reg.payment_status !== 'paid' || fee === 0;
  const paid = (original ?? 0) + additions;
  return { registrationId: reg.id, division: reg.division, known, paid: known ? paid / 100 : null, price: fee, due: known ? Math.max(0, cents(fee) - paid) / 100 : null };
}
