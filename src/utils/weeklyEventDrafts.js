export async function weeklyEventDraftRequest(client, action, { host, id, revision, weeks, fields, code, signal } = {}) {
  signal?.throwIfAborted();
  let query = client.rpc('admin_weekly_event_draft', {
    p_action: action,
    ...(host && { p_host: host }),
    ...(id && { p_id: id }),
    ...(revision != null && { p_revision: revision }),
    ...(weeks != null && { p_weeks: weeks }),
    ...(fields && { p_fields: fields }),
    ...(code && { p_code: code }),
  });
  if (signal && query.abortSignal) query = query.abortSignal(signal);
  const { data, error } = await query;
  signal?.throwIfAborted();
  if (error) throw new Error(error.message || 'The weekly draft action failed.');
  const validDraft = draft => typeof draft?.id === 'string' && Number.isInteger(draft.revision) && draft.revision > 0
    && Number.isInteger(draft.weeks) && draft.weeks >= 2 && draft.weeks <= 26 && (!host || draft.organisation_id === host);
  let valid = data?.id === id;
  if (action === 'list') valid = Array.isArray(data) && data.every(validDraft);
  if (action === 'load') valid &&= validDraft(data) && data.fields && !Array.isArray(data.fields) && typeof data.fields === 'object';
  if (action === 'save') valid &&= data.revision === revision + 1 && data.weeks === weeks;
  if (action === 'publish') valid &&= Array.isArray(data.published_ids) && data.published_ids.length === weeks
    && new Set(data.published_ids).size === weeks && data.published_ids.every(eventId => Number.isSafeInteger(eventId) && eventId > 0);
  if (!valid) throw new Error('The weekly draft response could not be verified.');
  return data;
}
