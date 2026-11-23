const activeMatchStatuses = ['pending', 'scheduled', 'in_progress'];
const scopes = {
  missing: match => !match.court_name || !match.scheduled_start,
  group: match => match.stage === 'group',
  elimination: match => ['knockout', 'placement'].includes(match.stage),
  all: () => true,
};

export const canScheduleNativeMatch = match => Boolean(match?.entry_one_id && match.entry_two_id && activeMatchStatuses.includes(match.status));

export function nativeCourtDateInput(iso) {
  const time = Date.parse(iso);
  return Number.isFinite(time) ? new Date(time + 120 * 60000).toISOString().slice(0, 16) : '';
}

const courtInput = raw => String(raw || '').trim() || null;
const rowHasChanged = (row, fields) => Object.entries(fields).some(([field, value]) => (row[field] ?? null) !== value);

function parseStart(input) {
  if (!input) return null;
  const time = Date.parse(input + ':00+02:00');
  if (!Number.isFinite(time) || nativeCourtDateInput(timeToIso(time)) !== input) throw new Error('Enter a valid South African date and start time.');
  return time;
}

const timeToIso = time => new Date(time).toISOString();

function scheduleTimes(start, playDays, fallbackDuration = null) {
  if (start == null) return { scheduled_start: null, scheduled_end: null };
  const scheduled_start = timeToIso(start);
  const day = playDays.find(day => day.play_date === nativeCourtDateInput(scheduled_start).slice(0, 10));
  const duration = Number(day?.match_duration_minutes) || fallbackDuration;
  return { scheduled_start, scheduled_end: duration > 0 ? timeToIso(start + duration * 60000) : null };
}

export function planNativeMatchSchedule(matches, playDays, mode, form) {
  const court = courtInput(form.court);
  const start = parseStart(form.start);
  if (mode === 'individual') {
    const match = matches.find(row => row.id === form.matchId);
    if (!canScheduleNativeMatch(match)) throw new Error('This match is unavailable for court setup.');
    const local = nativeCourtDateInput(match.scheduled_start);
    const fields = { court_name: court, ...(local === (form.start || '') ? {} : scheduleTimes(start, playDays)) };
    return rowHasChanged(match, fields) ? [{ match, fields }] : [];
  }

  const scope = scopes[form.scope];
  if (mode !== 'bulk' || !scope) throw new Error('Choose which fixtures to update.');
  if (!court && start == null) throw new Error('Enter a court or the first scheduled start time.');
  const interval = Number(form.intervalMinutes);
  if (start != null && (!Number.isFinite(interval) || interval < 1)) throw new Error('Enter an interval of at least one minute.');
  const ordered = matches.filter(match => canScheduleNativeMatch(match) && scope(match)).sort((a, b) =>
    (a.round_number || 0) - (b.round_number || 0) || (a.bracket_position || 0) - (b.bracket_position || 0) || String(a.id).localeCompare(String(b.id)),
  );
  const updates = [];
  let offset = 0;
  for (const match of ordered) {
    const fields = {};
    if (court && (form.overwriteCourts || !match.court_name)) fields.court_name = court;
    if (start != null && (form.overwriteTimes || !match.scheduled_start)) {
      Object.assign(fields, scheduleTimes(start + offset * interval * 60000, playDays, interval));
      offset++;
    }
    if (rowHasChanged(match, fields)) updates.push({ match, fields });
  }
  return updates;
}

export function sameReviewedSchedule(review, fresh) {
  return review.length === fresh.length && review.every(({ match, fields }, i) => (
    match.id === fresh[i].match.id && match.draw_id === fresh[i].match.draw_id
    && match.updated_at === fresh[i].match.updated_at && match.status === fresh[i].match.status
    && JSON.stringify(fields) === JSON.stringify(fresh[i].fields)
  ));
}
