// Source authority: deployed can_manage_event, shared with current Event Manager.
// This boundary performs reads only; it does not grant permissions.
export async function verifyEventOperationAccess({ client, eventId, expectedUserId, scopeId = 'all', signal }) {
  const cancel = () => { if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError'); };
  cancel();
  if (!expectedUserId || !Number.isSafeInteger(Number(eventId)) || Number(eventId) <= 0) throw new Error('Sign in and choose a saved event.');
  if (scopeId !== 'all' && !/^(org|club):[^:]+$/.test(scopeId)) throw new Error('Choose an authorised event workspace.');
  const { data: auth, error: authError } = await client.auth.getUser(); cancel();
  if (authError || auth?.user?.id !== expectedUserId) throw new Error('The signed-in account changed. Reopen this event.');
  let query = client.from('calendar').select('id,is_manual,event_status,organisation_id,club_id').eq('id', eventId);
  if (signal) query = query.abortSignal(signal);
  const { data: event, error } = await query.single(); cancel();
  if (error || !event || String(event.id) !== String(eventId)) throw new Error('The event is no longer available. Reload before continuing.');
  if (scopeId !== 'all') {
    const [kind, id] = scopeId.split(':');
    if (String(kind === 'org' ? event.organisation_id : event.club_id) !== id) throw new Error('The event is outside the selected workspace.');
  }
  let access = client.rpc('can_manage_event', { p_event_id: Number(eventId) });
  if (signal) access = access.abortSignal(signal);
  const { data: permitted, error: accessError } = await access; cancel();
  if (accessError || permitted !== true) throw new Error('Current Event Manager authority is required for this event.');
  return { user: auth.user, event };
}
