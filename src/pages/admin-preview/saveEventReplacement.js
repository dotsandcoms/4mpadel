import { verifyEventOperationAccess } from './eventOperationAccess.js';

const identity = email => String(email || '').trim().toLowerCase();

export async function saveEventReplacement({ client, event, registration, replacement, expectedUserId, scopeId,
  isCurrent = () => true, onAttempt = () => {}, verifyAccess = verifyEventOperationAccess }) {
  if (String(registration?.event_id) !== String(event?.id) || !registration?.email
      || !replacement?.id || !replacement.email
      || [registration.email, registration.partner_email].some(email => identity(email) === identity(replacement.email))) {
    throw new Error('Choose a different player and an active entry for this event.');
  }
  const access = await verifyAccess({ client, eventId: event.id, expectedUserId, scopeId });
  if (!isCurrent() || String(access?.event?.id) !== String(event.id)) throw new Error('The event workspace changed.');
  if (!access.event.is_manual || access.event.event_status === 'cancelled') throw new Error('This event is unavailable for substitutions.');
  onAttempt();
  const { error, data } = await client.rpc('replace_registration_player', {
    p_registration_id: registration.id,
    p_expected_email: registration.email,
    p_expected_partner_email: registration.partner_email || null,
    p_new_player_id: replacement.id,
  });
  if (error) throw error;
  if (String(data?.registration_id) !== String(registration.id) || identity(data?.new_email) !== identity(replacement.email)) {
    throw new Error('Could not verify the saved replacement.');
  }
  return data;
}
