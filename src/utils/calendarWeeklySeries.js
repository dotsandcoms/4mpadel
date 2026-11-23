const identity = value => value == null ? '' : String(value);
export function weeklyUnlinkedOrganiser(event) {
  if (event.organisation_id != null || event.club_id != null) return null;
  return identity(event.organiser_email).trim().toLowerCase() || identity(event.organiser_name).trim().toLowerCase();
}

export function isLinkedWeeklyEvent(event) {
  return Boolean(event?.is_weekly === true && event.series_id && Number.isSafeInteger(Number(event.id)) && Number(event.id) > 0);
}

export function reviewedWeeklyMembers(anchor, rows, { editable = false } = {}) {
  if (!isLinkedWeeklyEvent(anchor) || !Array.isArray(rows) || !rows.some(row => identity(row.id) === identity(anchor.id))) {
    throw new Error('The weekly series changed. Close and reopen it.');
  }
  if (weeklyUnlinkedOrganiser(anchor) === '') throw new Error('The organiser for this weekly series could not be verified.');
  const ids = new Set(rows.map(row => identity(row.id)));
  if (ids.size !== rows.length || rows.some(row => !isLinkedWeeklyEvent(row) || row.is_manual !== true
    || identity(row.series_id) !== identity(anchor.series_id)
    || identity(row.organisation_id) !== identity(anchor.organisation_id)
    || identity(row.club_id) !== identity(anchor.club_id)
    || weeklyUnlinkedOrganiser(row) !== weeklyUnlinkedOrganiser(anchor))) {
    throw new Error('This weekly series contains events from different organisers or clubs. Review its links before changing the series.');
  }
  if (editable && rows.some(row => row.event_status === 'cancelled')) {
    throw new Error('This weekly series contains a cancelled occurrence. Review the series before editing all weeks.');
  }
  return [...rows].sort((a, b) => identity(a.start_date).localeCompare(identity(b.start_date)) || Number(a.id) - Number(b.id));
}

export function verifyWeeklyOwnerUnchanged(event, candidate) {
  if (['organisation_id', 'club_id'].some(key => candidate?.[key] !== undefined && identity(candidate[key]) !== identity(event[key]))) {
    throw new Error('Weekly series settings cannot change its organiser or club.');
  }
}

export function scopeWeeklyOccurrence(query, row) {
  let scoped = query.eq('id', row.id).eq('is_manual', true).eq('is_weekly', true).eq('series_id', row.series_id);
  const columns = ['organisation_id', 'club_id', 'event_status', 'event_name', 'start_date', 'slug'];
  if (row.organisation_id == null && row.club_id == null) columns.push('organiser_email', 'organiser_name');
  for (const col of columns) {
    scoped = row[col] == null ? scoped.is(col, null) : scoped.eq(col, row[col]);
  }
  return scoped;
}
