// Synthetic QA records only. This client has no network connection or write API.
export const players = Array.from({ length: 105 }, (_, i) => ({
  id: `test-${String(i + 1).padStart(3, '0')}`, name: `Test Player ${String(i + 1).padStart(3, '0')}`,
  email: `player${i + 1}@example.test`, contact_number: null, region: i % 3 === 0 ? 'Gauteng' : i % 3 === 1 ? 'Western Cape' : null,
  category: i % 2 ? 'Advanced' : 'Open', points: i ? i * 112 : 0, rank_label: i ? 'Ranked' : null,
  image_url: null, paid_registration: i % 4 !== 3, license_type: i % 4 === 0 ? 'full' : i % 4 === 1 ? 'temporary' : i % 4 === 2 ? 'other' : 'none',
  approved: i % 5 !== 0, created_at: '2026-08-10T10:00:00Z', home_club: 'QA Padel Club', gender: i % 2 ? 'Female' : 'Male',
  bio: i === 0 ? 'Synthetic player for UI verification. Not a real customer.' : '',
  temporary_licenses: i === 1 ? [{ id: 'lic-test', event_id: 9001, event_name: 'QA test event', event_date: '2026-08-14', created_at: '2026-08-01' }] : [],
}));
export const tables = {
  players,
  calendar: [{ id: 9001, event_name: 'QA test event', start_date: '2026-08-14', venue: 'QA Padel Club' }],
  event_registrations: [
    { id: 'reg-test-1', event_id: 9001, email: players[0].email, full_name: players[0].name, partner_email: players[1].email, partner_name: players[1].name, division: 'Open', payment_status: 'paid', status: 'registered', created_at: '2026-08-10' },
    { id: 'reg-test-2', event_id: 9001, email: players[1].email, full_name: players[1].name, partner_email: players[0].email, partner_name: players[0].name, division: 'Open', payment_status: 'pending', status: 'registered', created_at: '2026-08-10' },
  ],
  payments: [{ id: 'pay-test-1', player_id: players[0].id, event_id: null, payment_type: 'full_license', amount: 400, status: 'success', created_at: '2026-08-01', reference: 'QA-NOT-A-PAYMENT', metadata: {} }],
};
export function mockReadClient(source = tables, { cap = 500, errors = {} } = {}) {
  const calls = [];
  return { calls, from(table) {
    let rows = [...(source[table] || [])]; let start = 0; let end = 499; let signal;
    const query = {
      select(fields) { calls.push({ table, fields }); return query; },
      order(field) { rows.sort((a, b) => String(a[field]).localeCompare(String(b[field]))); return query; },
      eq(field, value) { rows = rows.filter(row => row[field] === value); return query; },
      in(field, values) { rows = rows.filter(row => values.includes(row[field])); return query; },
      ilike(field, value) { const exact = value.replace(/\\([\\%_])/g, '$1').toLowerCase(); rows = rows.filter(row => String(row[field] || '').toLowerCase() === exact); return query; },
      range(a, b) { start = a; end = b; return query; },
      abortSignal(s) { signal = s; return query; },
      then(resolve, reject) { return Promise.resolve(signal?.aborted ? { error: new DOMException('Cancelled', 'AbortError') } : errors[table] ? { error: new Error(errors[table]) } : { data: rows.slice(start, Math.min(end + 1, start + cap)), error: null }).then(resolve, reject); },
    };
    return query;
  } };
}
