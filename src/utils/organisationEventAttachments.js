export async function uploadOrganisationEventAttachment({ client, organisationId, eventId, kind, file, checkpoint }) {
  const maxBytes = 10 * 1024 * 1024;
  if (!file?.size || file.size > maxBytes) throw new Error('Choose an event attachment up to 10 MB.');
  const body = new FormData();
  body.set('organisation_id', organisationId);
  if (eventId) body.set('event_id', String(eventId));
  body.set('kind', kind);
  body.set('file', file);
  await checkpoint();
  const { data, error } = await client.functions.invoke('organisation-event-attachments', { body });
  if (error) {
    const details = await error.context?.json?.().catch(() => null);
    throw new Error(details?.message || 'The event attachment could not be uploaded.');
  }
  await checkpoint();
  const prefix = '/storage/v1/object/public/organisation-event-attachments/organisations/';
  const scope = eventId ? `${organisationId}/events/${eventId}` : `${organisationId}/drafts`;
  let url;
  try { url = new URL(data?.url); } catch { throw new Error('The attachment link could not be verified.'); }
  if (data.organisationId !== organisationId || String(data.eventId ?? '') !== String(eventId ?? '')
    || data.kind !== kind || url.protocol !== 'https:' || url.username || url.password
    || !url.pathname.startsWith(`${prefix}${scope}/${kind}/`)) {
    throw new Error('The attachment link could not be verified.');
  }
  return { url: url.href, contentType: data.contentType };
}
