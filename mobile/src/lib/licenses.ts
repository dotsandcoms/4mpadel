import { supabase } from '@/lib/supabase';
export type License = {
  id: string;
  license_type: 'full' | 'temporary';
  season_year: number;
  starts_on: string;
  ends_on: string;
  status: 'active' | 'upcoming' | 'expired' | 'revoked';
  source: string;
  event_name: string | null;
  purchased_on?: string | null;
  granted_on?: string | null;
};
export type LicenseBundle = {
  player_id: number;
  name: string;
  license_number: string | null;
  licenses: License[];
};
export type LicenseCheckoutError = Error & { code?: string; missingFields?: string[] };
export type LicenseQuote = {
  base: number;
  fee: number;
  total: number;
  feeLabel: string;
  enabled: boolean;
  active: boolean;
  isRenewal?: boolean;
  coveredByFull?: boolean;
  startsOn?: string;
  endsOn?: string;
  licenseNumber?: string | null;
  licenseType: string;
  licenseYear: number | null;
  eventId: number | null;
};
export async function fetchLicenses(): Promise<LicenseBundle> {
  const {
    data,
    error
  } = await supabase.rpc('get_player_licenses');
  if (error) throw error;
  return data;
}
export const licenseDate = (date: string) => !date ? '—' : new Date(`${String(date).slice(0, 10)}T12:00:00+02:00`).toLocaleDateString('en-ZA', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Africa/Johannesburg'
});
export async function invokeLicense(body: Record<string, unknown>) {
  const {
    data,
    error
  } = await supabase.functions.invoke('native-license-checkout', {
    body
  });
  if (error) {
    let payload: { error?: string; code?: string; missingFields?: string[] } = {};
    try { payload = await error.context?.json() || {}; } catch { /* Offline. */ }
    throw Object.assign(new Error(payload.error || 'Could not reach licence checkout. Please try again.'), { code: payload.code, missingFields: payload.missingFields || [] });
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
