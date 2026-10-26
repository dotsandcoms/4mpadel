import type { License } from './licenses';

// Keep the imported 2026 fallback consistent with the website and database.
export function licenseStartDate(row: Pick<License, 'license_type' | 'season_year' | 'source' | 'starts_on' | 'purchased_on'>): string {
  const start = row.starts_on;
  const purchased = row.purchased_on?.slice(0, 10);
  if (row.license_type === 'full' && Number(row.season_year) === 2026
      && row.source !== 'complimentary' && (!start || start === '2026-01-01')) {
    if (purchased && purchased > '2026-01-01' && purchased <= '2026-12-31') return purchased;
    return '2026-01-01';
  }
  return start;
}
