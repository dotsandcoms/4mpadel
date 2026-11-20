import { verifyEventOperationAccess } from './eventOperationAccess.js';

const normalizedEmail = value => String(value || '').trim().toLowerCase();
export function canAlignRegistrationProfile(registration) {
  const player = registration?._player;
  return Boolean(registration?.id && registration.status === 'registered' && !registration.withdrawn_at
    && player?.id && player.name?.trim() && normalizedEmail(player.email)
    && normalizedEmail(player.email) === normalizedEmail(registration.email) && player.name !== registration.full_name);
}

export async function alignRegistrationProfile({ client, event, registration, expectedUserId, scopeId,
  isCurrent = () => true, onAttempt = () => {} }) {
  if (!canAlignRegistrationProfile(registration) || String(registration.event_id) !== String(event.id)) {
    throw new Error('Choose an active registration with an exact matching player profile.');
  }
  const access = await verifyEventOperationAccess({ client, eventId: event.id, expectedUserId, scopeId });
  if (access.event.is_manual !== true || access.event.event_status === 'cancelled' || !isCurrent()) {
    throw new Error('The event workspace changed. Reopen this registration.');
  }
  const player = registration._player;
  onAttempt();
  const { data, error } = await client.rpc('admin_align_registration_profile_name', {
    p_event: Number(event.id), p_registration: registration.id, p_player: player.id, p_scope: scopeId,
    p_expected: {
      entry_name: registration.full_name ?? null, entry_email: registration.email,
      profile_name: player.name, profile_email: player.email, division: registration.division ?? null,
      division_id: registration.division_id ?? null,
    },
  });
  if (['PGRST202','42883'].includes(error?.code)) throw new Error('Profile name matching is temporarily unavailable.');
  if (error) throw error;
  if (String(data?.event_id) !== String(event.id) || String(data.registration_id) !== String(registration.id)
    || String(data.player_id) !== String(player.id) || data.full_name !== player.name) {
    throw new Error('The registration name change could not be confirmed.');
  }
  return data;
}
