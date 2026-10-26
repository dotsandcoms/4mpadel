import { invokeEventRefund } from '../../utils/removeEventEntries.js';

export async function cancelEventScope({ client, event, divisionId, reason = '' }) {
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth?.user?.email) throw new Error('Sign in before cancelling.');
  const { data: permission, error: permissionError } = await client.from('admin_sidebar_permissions').select('role').eq('email', auth.user.email).maybeSingle();
  if (permissionError || permission?.role !== 'super_admin') throw new Error('A verified super-admin account is required.');
  const { data: fresh, error: eventError } = await client.from('calendar').select('id,is_manual,event_status').eq('id', event.id).single();
  if (eventError || !fresh || !fresh.is_manual) throw new Error('A 4M-hosted event is required for this cancellation workflow.');
  if (fresh.event_status === 'cancelled') throw new Error('This event is already cancelled. Review its refund status before taking further action.');
  if (!divisionId) {
    const result = await invokeEventRefund(client, { action: 'cancel_event', event_id: fresh.id, cancellation_reason: reason.trim() || undefined });
    if (!result?.cancelled || !result?.processed) throw new Error('Cancellation was not confirmed. Refresh and inspect the event and refunds before retrying.');
    return result;
  }
  const { data: division, error: divisionError } = await client.from('tournament_divisions').select('id,name,is_active,cancelled_at,cancellation_refund_status').eq('id', divisionId).eq('event_id', fresh.id).single();
  if (divisionError || !division) throw new Error('The selected division could not be verified.');
  if (division.cancelled_at) throw new Error('This division is already cancelled. Review its refunds in the Income Statement; do not repeat the cancellation.');
  // Use the same dedicated action as the current live CancelEventDialog. The
  // server claims cancellation once, links legacy entries, and records refunds.
  // Never fall back to client-side closes/removals after an ambiguous response.
  const result = await invokeEventRefund(client, { action: 'cancel_division', event_id: fresh.id, division_id: division.id, cancellation_reason: reason.trim() || undefined });
  if (!result?.processed || !result?.cancelled || String(result.division_id) !== String(division.id)) throw new Error('Division cancellation was not confirmed. Refresh and inspect the division and refunds before retrying.');
  return result;
}
