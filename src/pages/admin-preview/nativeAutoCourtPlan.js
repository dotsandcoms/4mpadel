import { orderedScheduleDivisions, schedulePlayerKeys } from '../../utils/divisionSchedulePlan.js';
import { planningMatches } from '../../utils/drawPlanning.js';
import { validateScheduleChanges } from '../../utils/drawScheduleBoard.js';
import { scheduleMatchesAcrossPlayDays } from '../../utils/nativeDrawScheduler.js';
import { readNativeEventPlayPlan } from './nativeDrawPlayPlan.js';
import { readAll } from './playersData.js';

const statuses = ['draft', 'published', 'in_progress', 'completed'];

async function readDrawRecords(client, table, select, drawIds, signal) {
  const records = [];
  for (let index = 0; index < drawIds.length; index += 75) {
    records.push(...await readAll(() => client.from(table).select(select).in('draw_id', drawIds.slice(index, index + 75)).order('id'), signal));
  }
  return records;
}

export async function readNativeAutoCourtPlan(client, event, signal) {
  const [calendar, draws, reviews] = await Promise.all([
    readNativeEventPlayPlan(client, event, signal),
    readAll(() => client.from('draws').select('id,event_id,division_id,draw_kind,status')
      .eq('event_id', event.id).in('status', statuses).order('id'), signal),
    readAll(() => client.from('draw_player_reviews').select('division_id,state')
      .eq('event_id', event.id).order('division_id'), signal),
  ]);
  const drawIds = draws.map(draw => draw.id);
  const [matches, entries] = await Promise.all([
    readDrawRecords(client, 'draw_matches', '*', drawIds, signal),
    readDrawRecords(client, 'draw_entries', 'id,draw_id,team_name,player_one_id,player_two_id,player_one_name,player_two_name', drawIds, signal),
  ]);
  const drawMap = new Map(draws.map(draw => [draw.id, draw]));
  const validDivisions = new Set(calendar.divisions.map(division => division.id));
  return {
    divisions: calendar.divisions,
    playDays: calendar.days,
    matches: matches.map(match => ({ ...match, draws: drawMap.get(match.draw_id) })),
    entries,
    divisionConfigs: Object.fromEntries(reviews.filter(row => validDivisions.has(row.division_id)).map(row => [row.division_id, row.state?.workflow || {}])),
  };
}

export function prepareNativeAutoCourtPlan(data) {
  const entries = new Map(data.entries.map(entry => [entry.id, entry]));
  const byId = new Map(data.matches.map(match => [match.id, match]));
  const ordered = orderedScheduleDivisions(data.divisions, data.divisionConfigs).map(division => division.id);
  const planning = planningMatches(data.matches).map(match => ({
    ...match, possible_player_keys: schedulePlayerKeys(match, entries),
    allowed_play_dates: data.divisionConfigs[match.draws?.division_id]?.play_dates,
  }));
  const candidates = planning.filter(match => ordered.includes(match.draws?.division_id)
    && match.draws?.status !== 'completed' && !match.americano_fixture_key
    && ['pending', 'scheduled'].includes(match.status) && match.can_plan
    && (!match.court_name || !match.scheduled_start))
    .sort((a, b) => ordered.indexOf(a.draws.division_id) - ordered.indexOf(b.draws.division_id)
      || (a.round_number || 0) - (b.round_number || 0) || (a.bracket_position || 0) - (b.bracket_position || 0));
  if (candidates.length === 0) return [];
  const candidateIds = new Set(candidates.map(match => match.id));
  const updated = scheduleMatchesAcrossPlayDays({
    matches: candidates, playDays: data.playDays, divisionConfigs: data.divisionConfigs,
    existingMatches: planning.filter(match => !candidateIds.has(match.id) && match.status !== 'cancelled'),
  });
  const changes = Object.fromEntries(updated.map(({ id, ...fields }) => [id, fields]));
  const issues = validateScheduleChanges({ ...data, changes });
  if (issues.length) throw new Error(issues.join(' '));
  return updated.map(({ id, ...fields }) => {
    const match = byId.get(id);
    const label = [entries.get(match.entry_one_id)?.team_name, entries.get(match.entry_two_id)?.team_name].filter(Boolean).join(' vs ');
    return { match: { ...match, label: label || match.round_label || 'Match' }, fields };
  });
}

export function nativeAutoBookingRows(plan) {
  return plan.map(({ match, fields }) => ({
    match_id: match.id, draw_id: match.draw_id, expected_version: match.updated_at,
    court_name: fields.court_name, scheduled_start: fields.scheduled_start, scheduled_end: fields.scheduled_end,
  }));
}
