export function scopeCalendarQuery(query, scopeId) {
    if (scopeId === 'all') return query;

    const scope = /^(org|club):([^:]+)$/.exec(scopeId);
    if (!scope) throw new Error('Choose an authorised event workspace.');
    const [, kind, id] = scope;
    return query.eq(kind === 'org' ? 'organisation_id' : 'club_id', id);
}
