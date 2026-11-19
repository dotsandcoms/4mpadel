const columns = [
  ['Registration ID', 'id'], ['Player', 'full_name'], ['Email', 'email'], ['Partner', 'partner_name'],
  ['Division', 'division'], ['Payment state', 'payment_status'], ['Entry state', 'status'], ['Submitted', 'created_at'],
];

function safeCsvCell(value) {
  const text = String(value ?? '');
  const safe = /^[\s\u0000-\u001f]*[=+@-]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function registrationCsv(rows) {
  return [columns.map(([label]) => label), ...rows.map(row => columns.map(([, field]) => row[field]))]
    .map(row => row.map(safeCsvCell).join(',')).join('\r\n');
}

export function downloadRegistrations(eventId, rows) {
  const url = URL.createObjectURL(new Blob([registrationCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `4m-registrations-${eventId}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
