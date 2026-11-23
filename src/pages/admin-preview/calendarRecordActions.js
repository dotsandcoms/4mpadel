import { extractRankedinId } from '../../utils/rankedinLink.js';
import { eventPhase } from './calendarData.js';

export const calendarRankedinId = event => extractRankedinId(event.rankedin_id) || extractRankedinId(event.rankedin_url);

export async function verifyCalendarPlatformActor({ client, expectedUserId, scopeId, isCurrent }) {
  if (scopeId !== 'all' || !expectedUserId || !isCurrent()) {
    throw new Error('This action requires a verified all-workspaces administrator.');
  }
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth?.user?.email || auth.user.id !== expectedUserId) throw new Error('Sign in again before changing this event.');
  const [active, admin] = await Promise.all([
    client.rpc('account_is_active'), client.rpc('is_super_admin', { user_email: auth.user.email }),
  ]);
  if (active.error || active.data !== true || admin.error || admin.data !== true || !isCurrent()) throw new Error('A verified super-admin account is required.');
}

async function verifyCalendarRecord({ client, event, expectedUserId, scopeId, isCurrent }) {
  if (!Number.isSafeInteger(Number(event.id)) || Number(event.id) <= 0) throw new Error('Choose a saved calendar event.');
  await verifyCalendarPlatformActor({ client, expectedUserId, scopeId, isCurrent });
  const { data: fresh, error: readError } = await client.from('calendar')
    .select('id,event_name,slug,is_visible,finance_managed,is_weekly,series_id,rankedin_id,rankedin_url,start_date,end_date,event_status')
    .eq('id', event.id).single();
  if (readError || !fresh || fresh.slug !== event.slug || fresh.event_name !== event.event_name || !isCurrent()) {
    throw new Error('This event changed. Reopen it before continuing.');
  }
  return fresh;
}

export async function saveCalendarRecordAction({ client, event, action, gateway, expectedUserId, scopeId, isCurrent, onAttempt, signal, pastOnly = false }) {
  const access = { client, event, expectedUserId, scopeId, isCurrent };
  const fresh = await verifyCalendarRecord(access);
  if (action === 'sync-source') {
    const id = calendarRankedinId(fresh);
    if (!id || String(id) !== String(calendarRankedinId(event)) || fresh.event_status === 'cancelled') {
      throw new Error('This RankedIn event link changed. Close and reopen it.');
    }
    const past = eventPhase(fresh) === 'Past';
    if (pastOnly && !past) throw new Error('This event is no longer a past event.');
    const classes = await gateway.draws(id, signal);
    const results = past ? await gateway.winners(id, signal) : await gateway.upcoming(id, classes, signal);
    if (!Array.isArray(classes) || !Array.isArray(results)) throw new Error('RankedIn did not return a complete response. The existing cache was kept.');
    const current = await verifyCalendarRecord(access);
    if (String(calendarRankedinId(current)) !== String(id) || current.start_date !== fresh.start_date || current.end_date !== fresh.end_date || current.event_status !== fresh.event_status) {
      throw new Error('The link or event timing changed. Reopen the event to sync.');
    }
    onAttempt();
    const { error } = await client.from('rankedin_results_cache').upsert({
      event_id: fresh.id, rankedin_id: String(id), classes, winners: past ? results : [],
      has_draw: classes.some(item => item.IsPublished && Array.isArray(item.TournamentDraws) && item.TournamentDraws.length > 0), has_results: past && results.length > 0,
      upcoming_matches: past ? [] : results.slice(0, 15), last_synced_at: new Date().toISOString(),
    }, { onConflict: 'event_id' });
    if (error) throw error;
    return { message: 'RankedIn draw and results cache refreshed.' };
  }
  const tab = client.from('calendar');
  let query;
  if (action === 'delete') {
    onAttempt();
    query = tab.delete().eq('id', event.id).eq('event_name', event.event_name);
    query = await (event.slug == null ? query.is('slug', null) : query.eq('slug', event.slug)).select('id').single();
    if (query.error || String(query.data?.id) !== String(event.id)) throw query.error || new Error('Could not verify the deleted event.');
    return { message: 'Event deleted.' };
  }
  const column = action === 'visibility' ? 'is_visible' : action === 'finance' ? 'finance_managed' : null;
  if (!column || fresh[column] !== event[column] || fresh.series_id !== event.series_id || fresh.is_weekly !== event.is_weekly || !isCurrent()) {
    throw new Error('This event changed. Reopen it before continuing.');
  }
  const value = column === 'is_visible' ? fresh.is_visible === false : fresh.finance_managed !== true;
  if (action === 'visibility' && fresh.is_weekly && fresh.series_id) throw new Error('Review the weekly series before changing its visibility.');
  query = tab.update({ [column]: value }).eq('id', event.id);
  query = fresh[column] == null ? query.is(column, null) : query.eq(column, fresh[column]);
  onAttempt();
  const { data, error } = await query.select('id');
  if (error || !data?.some(row => String(row.id) === String(event.id))) throw error || new Error('Could not verify the event change.');
  return { message: action === 'finance' ? (value ? 'Added to Event Manager.' : 'Removed from Event Manager.')
    : value ? 'Event is visible on the website.' : 'Event is hidden from the website.' };
}
