import { buildEventPlayDays, mergeEventPlayDays } from '../../utils/nativeDrawScheduler.js';
import { planNativeMatchSchedule, sameReviewedSchedule } from './nativeMatchScheduling.js';
import { readAll } from './playersData.js';
import { verifyCalendarPlatformActor } from './calendarRecordActions.js';
import { completeReviewedNativeDraw } from './nativeDrawLifecycle.js';
import { insertReviewedNativeAwards, readNativeRankingReview } from './nativeDrawRanking.js';
import { verifyEventOperationAccess } from './eventOperationAccess.js';

const drawFields = 'id,event_id,division_id,draw_kind,format,status,updated_at,scoring_rules,tournament_divisions(name)';
const matchFields = 'id,draw_id,entry_one_id,entry_two_id,round_label,round_number,bracket_position,stage,status,court_name,scheduled_start,scheduled_end,updated_at';
const announcementFields = 'id,event_id,division_id,draw_id,title,message,is_pinned,is_active,created_at,updated_at';
const liveStatuses = ['pending', 'scheduled', 'in_progress'];
const optionalSchema = new Set(['42P01', '42703', 'PGRST204', 'PGRST205']);

async function verifyNativeEvent({ client, event, expectedUserId, scopeId, isCurrent, signal }) {
  await verifyCalendarPlatformActor({ client, expectedUserId, scopeId, isCurrent });
  const access = await verifyEventOperationAccess({ client, eventId: event.id, expectedUserId, scopeId, signal });
  if (!access.event.is_manual || access.event.event_status === 'cancelled' || !isCurrent()) {
    throw new Error('Choose an active 4M-hosted event.');
  }
}

function nativeDrawSelect(client, event) {
  return client.from('draws').select(drawFields).eq('event_id', event.id);
}

export async function listNativeDrawOperations({ client, event, signal, ...access }) {
  await verifyNativeEvent({ client, event, signal, ...access });
  return readAll(() => nativeDrawSelect(client, event).order('id'), signal);
}

async function readNativeDraw(client, event, drawId) {
  const { data, error } = await nativeDrawSelect(client, event).eq('id', drawId).single();
  if (error || !data || String(data.event_id) !== String(event.id) || data.status === 'archived') {
    throw error || new Error('This draw is no longer available in the selected event.');
  }
  return data;
}

async function optionalRead(load) {
  try { return await load(); }
  catch (error) { if (optionalSchema.has(error.code)) return null; throw error; }
}

function eventAnnouncements(client, event, signal) {
  return optionalRead(() => readAll(() => client.from('native_draw_announcements')
    .select(announcementFields).eq('event_id', event.id).order('id'), signal));
}

function featuredMatches(client, draw, signal) {
  return optionalRead(() => readAll(() => client.from('draw_matches')
    .select('id,is_featured').eq('draw_id', draw.id).eq('is_featured', true).order('id'), signal));
}

function nativeMatches(client, draw, signal) {
  return readAll(() => client.from('draw_matches').select(matchFields).eq('draw_id', draw.id).order('id'), signal);
}

async function nativeEventPlayDays(client, event, signal) {
  const days = await readAll(() => client.from('event_play_days').select('play_date,match_duration_minutes,is_active,is_removed,start_time,end_time,courts_count,minimum_break_minutes')
    .eq('event_id', event.id).order('play_date'), signal);
  return mergeEventPlayDays(buildEventPlayDays(event), days);
}

export async function loadNativeDrawOperations({ client, event, drawId, signal, ...access }) {
  await verifyNativeEvent({ client, event, signal, ...access });
  const draw = await readNativeDraw(client, event, drawId);
  if (!access.isCurrent()) throw new Error('The draw workspace changed.');
  const [matches, entries, featured, announcements, playDays] = await Promise.all([
    nativeMatches(client, draw, signal),
    readAll(() => client.from('draw_entries').select('id,team_name').eq('draw_id', draw.id).order('id'), signal),
    featuredMatches(client, draw, signal),
    eventAnnouncements(client, event, signal),
    canScheduleNativeDraw(draw) ? nativeEventPlayDays(client, event, signal) : [],
  ]);
  const names = new Map(entries.map(entry => [entry.id, entry.team_name]));
  return {
    draw,
    matches: matches.map(match => ({
      ...match, label: [names.get(match.entry_one_id), names.get(match.entry_two_id)].filter(Boolean).join(' vs ') || match.round_label || 'Match',
      is_featured: featured?.some(item => item.id === match.id),
    })),
    featuredAvailable: featured !== null,
    playDays,
    announcements: announcements?.filter(item => !item.division_id || item.division_id === draw.division_id && (!item.draw_id || item.draw_id === draw.id)) ?? null,
  };
}

export const canUpdateNativeMatches = draw => ['published', 'in_progress'].includes(draw.status);
export const canScheduleNativeDraw = draw => draw.format !== 'americano' && ['draft', 'published', 'in_progress'].includes(draw.status);
export const canReopenNativeDraw = draw => draw.draw_kind === 'main' && draw.status === 'published';

async function updateNativeMatch(client, draw, match, fields) {
  const { data, error } = await client.from('draw_matches').update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', match.id).eq('draw_id', draw.id).eq('status', match.status).eq('updated_at', match.updated_at).select('id').single();
  if (error || data?.id !== match.id) throw error || new Error('The match changed before the update was saved.');
}

async function applyNativeMatchSchedule({ client, event, draw, operation, isCurrent, onAttempt, signal }) {
  if (!canScheduleNativeDraw(draw)) throw new Error('Court setup is unavailable for this draw.');
  const [matches, playDays] = await Promise.all([nativeMatches(client, draw, signal), nativeEventPlayDays(client, event, signal)]);
  const plan = planNativeMatchSchedule(matches, playDays, operation.mode, operation.form);
  if (!plan.length || !sameReviewedSchedule(operation.plan, plan)) throw new Error('The bookings changed after review. Reload before continuing.');
  const confirmedDraw = await readNativeDraw(client, event, draw.id);
  if (confirmedDraw.updated_at !== draw.updated_at || confirmedDraw.status !== draw.status || !isCurrent()) {
    throw new Error('The draw changed after review.');
  }
  let saved = 0;
  for (const update of plan) {
    if (!isCurrent()) break;
    try {
      onAttempt();
      await updateNativeMatch(client, draw, update.match, update.fields);
      saved++;
    } catch (error) {
      throw new Error('Saved ' + saved + ' of ' + plan.length + ' reviewed matches before stopping. ' + (error.message || 'The next booking could not be verified.'));
    }
  }
  if (saved !== plan.length) throw new Error('Saved ' + saved + ' of ' + plan.length + ' reviewed matches before the workspace changed.');
  return saved === 1 ? 'Match court setup saved.' : 'Court setup saved for ' + saved + ' matches.';
}

export async function loadNativeDrawRanking({ client, event, draw, ...access }) {
  await verifyNativeEvent({ client, event, ...access });
  const current = await readNativeDraw(client, event, draw.id);
  if (current.updated_at !== draw.updated_at || !access.isCurrent()) throw new Error('The draw changed. Reopen it before reviewing points.');
  return readNativeRankingReview({ client, event, draw: current, signal: access.signal });
}

export async function saveNativeDrawOperation({ client, event, draw, operation, onAttempt, ...access }) {
  const context = { client, event, ...access };
  await verifyNativeEvent(context);
  const fresh = await readNativeDraw(client, event, draw.id);
  if (fresh.updated_at !== draw.updated_at || !access.isCurrent()) throw new Error('The draw changed. Reopen it before continuing.');

  if (operation.type === 'complete') {
    const matches = await nativeMatches(client, fresh, access.signal);
    return completeReviewedNativeDraw({ client, event, draw: fresh, reviewed: operation.matches, matches, onAttempt, ...access });
  }

  if (operation.type === 'rank') {
    return insertReviewedNativeAwards({ client, event, draw: fresh, operation, onAttempt, ...access });
  }

  if (operation.type === 'schedule') {
    return applyNativeMatchSchedule({ client, event, draw: fresh, operation, onAttempt, ...access });
  }

  if (operation.type === 'reopen') {
    if (!canReopenNativeDraw(fresh)) throw new Error('Only a published main draw can be reopened here.');
    onAttempt();
    const { error } = await client.rpc('reopen_native_draw_for_corrections', { p_draw_id: fresh.id });
    if (error) {
      if (['PGRST202', '42883'].includes(error.code)) throw new Error('The draw correction service is unavailable on this connection.');
      throw error;
    }
    if ((await readNativeDraw(client, event, fresh.id)).status !== 'draft') throw new Error('Could not confirm that the draw was reopened.');
    return 'Draw reopened for corrections.';
  }

  if (operation.type === 'announce') {
    const { scope, message, title, pinned } = operation;
    if (!['event', 'division', 'draw'].includes(scope) || !message.trim()
      || scope !== 'event' && !fresh.division_id) throw new Error('Choose a valid announcement scope and enter a message.');
    onAttempt();
    const { data, error } = await client.from('native_draw_announcements').insert({
      event_id: event.id, division_id: scope === 'event' ? null : fresh.division_id,
      draw_id: scope === 'draw' ? fresh.id : null, title: title.trim() || null, message: message.trim(), is_pinned: Boolean(pinned),
    }).select('id').single();
    if (error || !data?.id) throw error || new Error('Could not confirm the published announcement.');
    return 'Announcement published.';
  }

  if (operation.type === 'remove-announcement') {
    const item = operation.announcement;
    if (item.event_id !== event.id || item.division_id && item.division_id !== fresh.division_id
      || item.draw_id && item.draw_id !== fresh.id) throw new Error('This announcement belongs to another scope.');
    let query = client.from('native_draw_announcements').delete().eq('id', item.id).eq('event_id', event.id).eq('updated_at', item.updated_at);
    for (const column of ['division_id', 'draw_id']) {
      query = item[column] == null ? query.is(column, null) : query.eq(column, item[column]);
    }
    onAttempt();
    const { data, error } = await query.select('id').single();
    if (error || data?.id !== item.id) throw error || new Error('The announcement changed before it was removed.');
    return 'Announcement removed.';
  }

  if (!canUpdateNativeMatches(fresh)) throw new Error('Publish the draw before changing public matches.');
  const match = operation.match;
  const updatingFeature = operation.type === 'feature';
  if (!match || match.draw_id !== fresh.id || !['live', 'feature'].includes(operation.type)) throw new Error('Choose a match in this draw.');
  let fields;
  if (updatingFeature) {
    const featured = await featuredMatches(client, fresh, access.signal);
    if (!featured) throw new Error('Featured-match controls are unavailable on this connection.');
    if (!match.is_featured && featured.length >= 4) throw new Error('Remove a featured match before adding another.');
    if (featured.some(item => item.id === match.id) !== match.is_featured) throw new Error('This match changed. Reload the draw.');
    fields = { is_featured: !match.is_featured };
  } else {
    if (!liveStatuses.includes(match.status) || !match.entry_one_id || !match.entry_two_id) throw new Error('This match cannot change live status.');
    fields = { status: match.status === 'in_progress' ? (match.scheduled_start ? 'scheduled' : 'pending') : 'in_progress' };
  }
  if (!access.isCurrent()) throw new Error('The draw workspace changed.');
  onAttempt();
  await updateNativeMatch(client, fresh, match, fields);
  return updatingFeature ? fields.is_featured ? 'Match featured on the public draw.' : 'Match removed from the featured list.'
    : fields.status === 'in_progress' ? 'Match marked live.' : 'Live status cleared.';
}

export const validNativeLiveMatch = match => Boolean(match?.entry_one_id && match.entry_two_id && liveStatuses.includes(match.status));
