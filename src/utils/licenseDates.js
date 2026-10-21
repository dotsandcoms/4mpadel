// Imported 2026 records initially used 1 January for every coverage start.
// Use linked purchase evidence while retaining deliberate starts and other years.
export function licenseStartDate(row) {
  const start = row.starts_on;
  const purchased = row.purchased_on?.slice(0, 10);
  if (row.license_type === 'full' && Number(row.season_year) === 2026
      && row.source !== 'complimentary' && (!start || start === '2026-01-01')) {
    if (purchased && purchased > '2026-01-01' && purchased <= '2026-12-31') return purchased;
    return '2026-01-01';
  }
  return start;
}
