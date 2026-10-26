// Pure presentation helpers; no database mutations or inferred financial totals.
export function compareEventDates(a, b) {
  const left = String(a.start_date || '');
  const right = String(b.start_date || '');
  if (!left || !right) return left ? -1 : right ? 1 : 0;
  return left.localeCompare(right);
}

export function activeEventEntries(registrations) {
  const selected = new Map();
  const withoutEmail = [];
  const score = row => (String(row.payment_status).toLowerCase() === 'paid' ? 100 : 0)
    + (row.partner_email || row.partner_name ? 10 : 0)
    + (row.phone || row.contact_number ? 1 : 0)
    + (Date.parse(row.created_at || '') || 0) / 1e15;
  registrations.filter(row => String(row.status).toLowerCase() !== 'withdrawn').forEach(row => {
    const email = String(row.email || '').trim().toLowerCase();
    if (!email) { withoutEmail.push(row); return; }
    const key = `${row.event_id}::${email}::${row.division || ''}`;
    if (!selected.has(key) || score(row) > score(selected.get(key))) selected.set(key, row);
  });
  return [...selected.values(), ...withoutEmail];
}

export function registrationWindow(event, now = Date.now()) {
  const closes = Date.parse(event.registration_closes_at);
  const opens = Date.parse(event.registration_opens_at);
  if (Number.isFinite(closes) && now > closes) return { label: 'Closed', tone: 'danger' };
  if (Number.isFinite(opens) && now < opens) return { label: 'Not yet open', tone: 'warning' };
  // A date alone does not prove that registrations are enabled.
  return { label: 'Check event settings', tone: 'neutral' };
}
