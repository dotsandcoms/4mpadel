// Client-side defence in depth. Database RLS must enforce the same boundaries.
export function canReadPreviewEvents(permissions) {
  return permissions?.role === 'super_admin'
    || permissions?.allowed_tabs?.includes('event-mgmt')
    || (permissions?.module_permissions?.['event-mgmt']?.allowedEvents?.length || 0) > 0;
}

export function restrictPreviewEvents(query, permissions, scope) {
  if (!canReadPreviewEvents(permissions)) throw new Error('Event Manager access is required.');
  const allowed = permissions?.module_permissions?.['event-mgmt']?.allowedEvents;
  if (permissions.role !== 'super_admin' && allowed?.length) query = query.in('id', allowed);
  if (scope?.type === 'Organisation') query = query.eq('organisation_id', scope.recordId);
  else if (scope?.type === 'Club') query = query.eq('club_id', scope.recordId);
  return query;
}

export function previewScopes(permissions) {
  return [
    { id: 'all', label: permissions?.role === 'super_admin' ? 'All 4M Padel' : 'My authorised access', type: 'Account scope' },
    ...(permissions?.orgs || []).map(org => ({ id: `org:${org.id}`, recordId: org.id, label: org.name, type: 'Organisation' })),
    ...(permissions?.clubs || []).map(club => ({ id: `club:${club.id}`, recordId: club.id, label: club.name, type: 'Club' })),
  ];
}
