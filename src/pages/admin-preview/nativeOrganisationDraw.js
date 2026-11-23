import { verifyOrganisationHostBuilder } from './organisationHostEvents.js';

export const organisationDrawScope = (scopeId = 'all') => scopeId.startsWith('org:') ? scopeId.slice(4) : null;

export async function verifyOrganisationDrawScope({ client, event, expectedUserId, scopeId, isCurrent }) {
  const organisationId = organisationDrawScope(scopeId);
  if (organisationId !== event.organisation_id) throw new Error('Choose an event in this organisation workspace.');
  return verifyOrganisationHostBuilder({ client, organisationId, scopeId, actorId: expectedUserId, isCurrent, event });
}

export async function saveOrganisationDrawOperation({ client, event, draw, operation, onAttempt, scopeId, isCurrent }) {
  const organisationId = organisationDrawScope(scopeId);
  if (!organisationId || !isCurrent() || !['live', 'feature', 'complete'].includes(operation.type)) {
    throw new Error('This native draw action is unavailable for organisation accounts.');
  }
  const match = operation.match;
  if (['live', 'feature'].includes(operation.type) && (!match || match.draw_id !== draw.id)) throw new Error('Choose a match in this draw.');
  const versions = operation.type === 'complete'
    ? Object.fromEntries(operation.matches.map(([id, status, updatedAt]) => [id, [status, updatedAt]])) : undefined;
  onAttempt();
  const { data, error } = await client.rpc('native_manage_organisation_draw', {
    p_organisation_id: organisationId, p_event_id: event.id, p_draw_id: draw.id, p_expected_draw: draw.updated_at,
    p_action: operation.type,
    ...(match ? { p_match_id: match.id, p_expected_match: match.updated_at } : {}),
    ...(versions ? { p_matches: versions } : {}),
  });
  if (error) throw error;
  if (!isCurrent() || data?.organisation_id !== organisationId || String(data.event_id) !== String(event.id)
    || data.draw_id !== draw.id || data.action !== operation.type || (match && data.match_id !== match.id)) {
    throw new Error('Could not verify the organisation draw change.');
  }
  switch (operation.type) {
    case 'live':
      if (!['in_progress', 'pending', 'scheduled'].includes(data.status)) throw new Error('Could not verify the live status.');
      return data.status === 'in_progress' ? 'Match marked live.' : 'Live status cleared.';
    case 'feature':
      if (typeof data.featured !== 'boolean') throw new Error('Could not verify the featured match.');
      return data.featured ? 'Match featured on the public draw.' : 'Match removed from the featured list.';
    case 'complete':
      if (data.status !== 'completed') throw new Error('Could not verify draw completion.');
      return 'Draw marked complete.';
  }
}
