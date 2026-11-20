const MANAGER_ROLES = new Set(['owner', 'admin']);

export function resolveEventWorkspace(permissions, scopeId, module) {
    if (!permissions) return null;
    const organisationList = permissions.orgs || [];
    const clubList = permissions.clubs || [];
    const tenant = organisationList.length > 0 || clubList.length > 0;
    const hasTab = permissions.allowed_tabs?.includes(module);
    const platform = permissions.role === 'super_admin';
    const assignment = permissions.module_permissions?.['event-mgmt']?.allowedEvents;
    const hasAssignments = Array.isArray(assignment) && assignment.length > 0;
    const allowedEvents = hasAssignments
        ? [...new Set(assignment.filter(id => typeof id === 'number' || typeof id === 'string' && /^\d+$/.test(id))
            .map(Number).filter(id => Number.isSafeInteger(id) && id > 0))]
        : [];
    if (!platform && hasAssignments && allowedEvents.length === 0) return null;

    const ownerOrAdmin = value => value.id && MANAGER_ROLES.has(value.member_role);
    const tenants = [
        ...organisationList.filter(ownerOrAdmin).map(organisation => ({ id: `org:${organisation.id}`, organisation })),
        ...clubList.filter(ownerOrAdmin).map(club => ({ id: `club:${club.id}` })),
    ];
    if (scopeId !== 'all' || (tenant && !platform)) {
        const selected = scopeId === 'all' ? tenants[0] : tenants.find(item => item.id === scopeId);
        return selected ? { scopeId: selected.id, organisation: selected.organisation, allowedEvents: platform ? [] : allowedEvents, allowPlatformActions: false, requireEventScope: true } : null;
    }
    if (platform || (!tenant && permissions.role === 'custom' && hasTab && !hasAssignments)) {
        return { scopeId: 'all', allowedEvents: [], allowPlatformActions: true, requireEventScope: false };
    }
    if (!tenant && hasAssignments && (module === 'event-mgmt' || hasTab)) {
        return { scopeId: 'all', allowedEvents, allowPlatformActions: false, requireEventScope: true };
    }
    return null;
}

export function scopeCalendarQuery(query, scopeId) {
    if (scopeId === 'all') return query;

    const scope = /^(org|club):([^:]+)$/.exec(scopeId);
    if (!scope) throw new Error('Choose an authorised event workspace.');
    const [, kind, id] = scope;
    return query.eq(kind === 'org' ? 'organisation_id' : 'club_id', id);
}
