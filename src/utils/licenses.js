import { supabase } from '../supabaseClient';
export async function licenseRpc(name, args = {}) {
  const {
    data,
    error
  } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}
export async function licenseCheckout(body) {
  const {
    data,
    error
  } = await supabase.functions.invoke('native-license-checkout', {
    body
  });
  if (error) {
    let payload = {};
    try { payload = await error.context?.json() || {}; } catch { /* Offline. */ }
    const failure = new Error(payload.error || 'Could not reach license checkout. Please try again.');
    failure.code = payload.code;
    failure.missingFields = payload.missingFields || [];
    failure.profileUrl = payload.profileUrl;
    throw failure;
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
export async function eventLicense(playerId, eventId) {
  if (!playerId) return {
    active: false,
    label: 'No active license'
  };
  const result = await licenseRpc('player_license_eligibility', {
    p_player_id: playerId,
    p_event_id: Number(eventId)
  });
  return {
    active: !!(result?.full || result?.temporary),
    full: !!result?.full,
    fullPrice: result?.full_price == null ? null : Number(result.full_price),
    purchaseYear: result?.purchase_year,
    renewalEligible: !!result?.renewal_eligible,
    label: result?.full ? `${result.year} Full license` : result?.temporary ? 'Temporary license · this event' : 'No active license for this event'
  };
}
export const licenseDate = value => value ? new Date(`${String(value).slice(0, 10)}T12:00:00+02:00`).toLocaleDateString('en-ZA', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Africa/Johannesburg'
}) : '—';
export const licenseLabel = row => row.license_type === 'full' ? `${row.season_year} Full license` : `Temporary · ${row.event_name || 'Event'}`;
export async function hydrateEventLicenses(players, eventId) {
  const ids = [...new Set(players.map(p => p?.id).filter(Boolean))];
  if (!ids.length) return players;
  const statuses = new Map();
  for (let i = 0; i < ids.length; i += 500) {
    const rows = await licenseRpc('event_license_status', {
      p_event_id: Number(eventId),
      p_player_ids: ids.slice(i, i + 500)
    });
    for (const row of rows || []) statuses.set(Number(row.player_id), row.eligibility);
  }
  return players.map(p => {
    const lic = statuses.get(Number(p.id));
    return {
      ...p,
      event_license: {
        event_id: Number(eventId),
        ...lic
      },
      license_type: lic?.full ? 'full' : lic?.temporary ? 'temporary' : 'none',
      paid_registration: !!(lic?.full || lic?.temporary)
    };
  });
}
