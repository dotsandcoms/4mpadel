import { notifyEntityDecision } from './entityDecisions.js';
import { entityEqual, verifyEntityAccess } from './organisationFederationData.js';

const eventFields = 'id,event_name,organisation_id,sanction_status,is_visible,rejection_notes,organiser_email';
const notificationRecipient = (host, event) => host.contact_email?.trim() || event.organiser_email?.trim() || '';

function loadHost(client, organisationId, signal) {
  const query = client.from('organisations').select('id,name,contact_email').eq('id', organisationId);
  return (signal ? query.abortSignal(signal) : query).maybeSingle();
}

async function requirePlatform({ client, userId, scopeId, signal, isCurrent }) {
  if (scopeId !== 'all') throw new Error('Open this event in the platform Organisations workspace.');
  const access = await verifyEntityAccess(client, 'organisations', { userId, scopeId, signal, isCurrent });
  if (!access.superAdmin) throw new Error('Current platform super-admin access is required to revoke sanction.');
}

export async function loadOrganisationSanctionReview({ client, organisationId, eventId, ...context }) {
  if (!organisationId || !Number.isSafeInteger(Number(eventId)) || Number(eventId) < 1) throw new Error('Choose an event in this organisation.');
  await requirePlatform({ client, ...context });
  let event = client.from('calendar').select(eventFields).eq('id', eventId)
    .eq('organisation_id', organisationId).eq('sanction_status', 'approved');
  if (context.signal) event = event.abortSignal(context.signal);
  const [eventResult, organisationResult] = await Promise.all([event.maybeSingle(), loadHost(client, organisationId, context.signal)]);
  const record = eventResult.data, host = organisationResult.data;
  if (eventResult.error || organisationResult.error || Number(record?.id) !== Number(eventId)
    || record?.organisation_id !== organisationId || record.sanction_status !== 'approved' || host?.id !== organisationId) {
    throw new Error('The approved event or its organisation changed. Refresh and reopen the event.');
  }
  await requirePlatform({ client, ...context });
  return { record, host, recipient: notificationRecipient(host, record) };
}

export async function saveOrganisationSanctionRevocation({ client, organisationId, eventId, review, reason, onAttempt, ...context }) {
  const feedback = String(reason ?? '').trim();
  if (!feedback || feedback.length > 2000) throw new Error('Enter rejection feedback of up to 2,000 characters.');
  const current = await loadOrganisationSanctionReview({ client, organisationId, eventId, ...context });
  if (!entityEqual(current, review)) throw new Error('The event or notification contact changed during review.');

  const { record } = current;
  const patch = { sanction_status: 'rejected', is_visible: false, rejection_notes: feedback };
  let query = client.from('calendar').update(patch).eq('id', eventId).eq('organisation_id', organisationId)
    .eq('sanction_status', 'approved').eq('event_name', record.event_name);
  for (const field of ['is_visible', 'rejection_notes', 'organiser_email']) {
    query = record[field] == null ? query.is(field, null) : query.eq(field, record[field]);
  }
  onAttempt?.();
  const { data, error } = await query.select('id,organisation_id,sanction_status,is_visible,rejection_notes').maybeSingle();
  if (error || Number(data?.id) !== Number(eventId) || data?.organisation_id !== organisationId
    || data.sanction_status !== 'rejected' || data.is_visible !== false || data.rejection_notes !== feedback) {
    throw new Error('The backend did not confirm sanction revocation for this event.');
  }

  try { await requirePlatform({ client, ...context }); }
  catch { return { message: 'Sanction revoked. The host notification needs current platform access.' }; }
  let savedEvent = client.from('calendar').select('id,organiser_email').eq('id', eventId)
    .eq('organisation_id', organisationId).eq('sanction_status', 'rejected').eq('is_visible', false);
  if (context.signal) savedEvent = savedEvent.abortSignal(context.signal);
  const [latestHost, latestEvent] = await Promise.all([
    loadHost(client, organisationId, context.signal), savedEvent.maybeSingle(),
  ]);
  if (latestEvent.error || Number(latestEvent.data?.id) !== Number(eventId)) {
    return { message: 'Sanction was revoked. Check the current event before notifying the organisation.' };
  }
  if (latestHost.error || latestHost.data?.id !== organisationId
    || notificationRecipient(latestHost.data, latestEvent.data) !== current.recipient) {
    return { message: 'Sanction revoked. Check the organisation’s current notification contact.' };
  }
  try { await requirePlatform({ client, ...context }); }
  catch { return { message: 'Sanction revoked. The host notification needs current platform access.' }; }
  const delivery = await notifyEntityDecision(client, current.recipient, 'event_rejected', {
    eventName: record.event_name, notes: feedback,
  });
  return { message: delivery ? `Sanction revoked. ${delivery.replace(/^Decision saved\. /, '')}` : 'Sanction revoked. Host notification submitted.' };
}
