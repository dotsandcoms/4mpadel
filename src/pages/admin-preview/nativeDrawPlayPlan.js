import { buildEventPlayDays, mergeEventPlayDays } from '../../utils/nativeDrawScheduler.js';
import { validateDivisionSchedulePlan } from '../../utils/divisionSchedulePlan.js';
import { dayKey } from './calendarData.js';
import { readAll } from './playersData.js';

const playDayFields = 'id,play_date,start_time,end_time,courts_count,match_duration_minutes,minimum_break_minutes,is_active,is_removed,updated_at';
const minutes = time => String(time || '').slice(0, 5);
const orderedJson = value => JSON.stringify(value, (_key, nested) => nested && typeof nested === 'object' && !Array.isArray(nested)
  ? Object.fromEntries(Object.entries(nested).sort(([a], [b]) => a.localeCompare(b))) : nested);
const validTime = time => /^([01]\d|2[0-3]):[0-5]\d$/.test(time);

export async function readNativeEventPlayPlan(client, event, signal) {
  const [saved, divisions] = await Promise.all([
    readAll(() => client.from('event_play_days').select(playDayFields).eq('event_id', event.id).order('play_date'), signal),
    readAll(() => client.from('tournament_divisions').select('id,event_id,name,is_active').eq('event_id', event.id).order('name'), signal),
  ]);
  return {
    days: mergeEventPlayDays(buildEventPlayDays(event), saved),
    expected: Object.fromEntries(saved.map(day => [day.play_date, day.updated_at])),
    divisions: divisions.filter(division => division.is_active !== false && String(division.event_id) === String(event.id)),
  };
}

export function prepareNativePlayDays(days, versions) {
  const normalized = days.map(day => ({
    play_date: day.play_date, start_time: minutes(day.start_time), end_time: minutes(day.end_time),
    courts_count: Number(day.courts_count), match_duration_minutes: Number(day.match_duration_minutes),
    minimum_break_minutes: Number(day.minimum_break_minutes), is_active: day.is_active === true,
  }));
  if (!normalized.some(day => day.is_active)) throw new Error('Enable at least one play day.');
  if (new Set(normalized.map(day => day.play_date)).size !== normalized.length) throw new Error('Each day must have a unique date.');
  for (const day of normalized) {
    if (!day.play_date || dayKey(day.play_date) !== day.play_date || !validTime(day.start_time) || !validTime(day.end_time)
      || day.start_time >= day.end_time || !Number.isSafeInteger(day.courts_count) || day.courts_count < 1
      || !Number.isSafeInteger(day.match_duration_minutes) || day.match_duration_minutes < 1
      || !Number.isSafeInteger(day.minimum_break_minutes) || day.minimum_break_minutes < 0) {
      throw new Error('Check opening hours, court count, match duration and rest for ' + day.play_date + '.');
    }
  }
  return {
    days: normalized,
    versions: Object.fromEntries(normalized.map(day => [day.play_date, versions[day.play_date] ?? null])),
  };
}

export async function readNativeDivisionSchedule(client, eventId, divisionId) {
  const { data: division, error: divisionError } = await client.from('tournament_divisions').select('id,event_id,name,is_active')
    .eq('event_id', eventId).eq('id', divisionId).single();
  if (divisionError || !division || division.is_active === false || String(division.event_id) !== String(eventId)) {
    throw divisionError || new Error('Choose an active division in this event.');
  }
  const { data, error } = await client.from('draw_player_reviews').select('division_id,event_id,state,updated_at')
    .eq('event_id', eventId).eq('division_id', divisionId).maybeSingle();
  if (error) throw error;
  return { division, workflow: data?.state?.workflow || {}, state: data?.state || {}, expected: data?.updated_at ?? null };
}

export function prepareNativeDivisionSchedule(division, days, priority, dayPlans, workflow) {
  const schedule_priority = priority === '' || priority == null ? undefined : Number(priority);
  if (schedule_priority !== undefined && (!Number.isSafeInteger(schedule_priority) || schedule_priority < 0)) {
    throw new Error('Enter a non-negative whole-number scheduling priority.');
  }
  const allowedDays = days.filter(day => day.is_active && (!workflow.play_dates || workflow.play_dates.includes(day.play_date)));
  const schedule_days = { ...workflow.schedule_days };
  for (const day of allowedDays) {
    const values = dayPlans[day.play_date] || {};
    schedule_days[day.play_date] = {
      ...schedule_days[day.play_date],
      start_time: minutes(values.start_time),
      rounds: values.rounds === '' || values.rounds == null ? '' : Number(values.rounds),
    };
  }
  const plan = { schedule_days };
  if (schedule_priority !== undefined) plan.schedule_priority = schedule_priority;
  validateDivisionSchedulePlan({ [division.id]: { ...workflow, ...plan } }, [division], days);
  return plan;
}

export async function writeNativeDivisionSchedule({ client, event, userId, operation, isCurrent, onAttempt }) {
  const [fresh, calendar] = await Promise.all([
    readNativeDivisionSchedule(client, event.id, operation.divisionId),
    readNativeEventPlayPlan(client, event),
  ]);
  const plan = prepareNativeDivisionSchedule(fresh.division, calendar.days, operation.priority, operation.dayPlans, fresh.workflow);
  if (!isCurrent() || orderedJson(plan) !== orderedJson(operation.plan)) throw new Error('The division or playing hours changed after review.');
  const workflow = { ...fresh.workflow, ...plan };
  if (operation.priority === '') delete workflow.schedule_priority;
  if (orderedJson(workflow) === orderedJson(fresh.workflow)) return 'Division schedule already current.';
  if (fresh.expected !== operation.expected) throw new Error('The division plan changed after review.');
  const row = { division_id: operation.divisionId, event_id: event.id, confirmed_by: userId,
    updated_at: new Date().toISOString(), state: { ...fresh.state, workflow } };
  onAttempt();
  const table = client.from('draw_player_reviews');
  const query = fresh.expected
    ? table.update(row).eq('event_id', event.id).eq('division_id', operation.divisionId).eq('updated_at', fresh.expected)
    : table.insert(row);
  const { data, error } = await query.select('division_id,event_id').single();
  if (error || data?.division_id !== operation.divisionId || String(data.event_id) !== String(event.id)) {
    throw error || new Error('Could not confirm the division schedule.');
  }
  return 'Division schedule saved.';
}
