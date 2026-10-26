// Source: current MAIN utils/licenses.hydrateEventLicenses. No licence writes.
export async function hydrateEventLicenses(client, players, eventId, signal) {
  const cancel = () => { if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError'); };
  cancel();
  if (!Number.isSafeInteger(Number(eventId)) || Number(eventId) <= 0) throw new Error('A saved event is required for licence eligibility.');
  if (players.some(player => !player || !Number.isSafeInteger(Number(player.id)) || Number(player.id) <= 0)) throw new Error('Event licence eligibility requires a valid player identity. Reload these records.');
  const ids = [...new Set(players.map(player => Number(player.id)))];
  if (!ids.length) return players;
  const statuses = new Map();
  for (let offset = 0; offset < ids.length; offset += 500) {
    cancel();
    const batch = ids.slice(offset, offset + 500);
    let query = client.rpc('event_license_status', { p_event_id: Number(eventId), p_player_ids: batch });
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query; cancel();
    if (error || !Array.isArray(data)) throw new Error('Event licence eligibility could not be loaded. Reload before relying on these statuses.');
    for (const row of data) {
      const id = Number(row?.player_id);
      if (!batch.includes(id) || statuses.has(id) || !row?.eligibility || typeof row.eligibility.full !== 'boolean' || typeof row.eligibility.temporary !== 'boolean') throw new Error('Event licence eligibility returned an unexpected response.');
      statuses.set(id, row.eligibility);
    }
    if (batch.some(id => !statuses.has(id))) throw new Error('Event licence eligibility is incomplete. No missing player is assumed unlicensed.');
  }
  return players.map(player => {
    const eligibility = statuses.get(Number(player.id));
    return eligibility ? { ...player, event_license: { ...eligibility, event_id: Number(eventId) }, license_type: eligibility.full ? 'full' : eligibility.temporary ? 'temporary' : 'none', paid_registration: eligibility.full || eligibility.temporary } : player;
  });
}
export function eventLicenseCategory(player, eventId) {
  const licence = player?.event_license;
  if (!licence || String(licence.event_id) !== String(eventId)) return null;
  if (typeof licence.full !== 'boolean' || typeof licence.temporary !== 'boolean') throw new Error('Event licence eligibility returned an unexpected response.');
  return licence.full ? 'full' : licence.temporary ? 'temp' : 'none';
}
