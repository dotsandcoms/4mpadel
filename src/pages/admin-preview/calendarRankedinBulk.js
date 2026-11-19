import { dayKey, eventPhase } from './calendarData.js';
import { readAll } from './playersData.js';
import { buildRankedinTournamentUrl, extractRankedinId } from '../../utils/rankedinLink.js';
import { getFederationEventsOrgId } from '../../utils/federation.js';
import { calendarRankedinId, saveCalendarRecordAction, verifyCalendarPlatformActor } from './calendarRecordActions.js';

const calendarFields = 'id,event_name,slug,rankedin_id,rankedin_url,is_manual,is_league,sapa_status,start_date,end_date,event_dates,city,venue,description,address,image_url,sponsor_logos,registered_players,event_status';
const slugify = value => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
const formatDay = day => new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(day + 'T12:00:00Z'));

function providerCalendarEvent(event) {
  const rankedin_id = extractRankedinId(event.eventId ?? event.Id ?? event.id);
  const event_name = String(event.eventName || event.name || event.Name || '').trim();
  const start_date = dayKey(event.startDate || event.StartDate);
  const end_date = dayKey(event.endDate || event.EndDate) || start_date;
  if (!rankedin_id || !/^[1-9]\d*$/.test(rankedin_id) || !event_name || !start_date || end_date < start_date) return null;
  const slug = slugify(String(event.slug || event.Slug || event_name)) || ('rankedin-' + rankedin_id);
  const is_league = Number(event.type) === 2;
  const providedLink = event.eventUrl || event.link || event.Link;
  const canonical = is_league ? 'https://www.rankedin.com/en/clubleague/' + rankedin_id + '/' + slug : buildRankedinTournamentUrl(rankedin_id, slug);
  let rankedin_url = canonical;
  if (providedLink) {
    try {
      const url = new URL(providedLink, canonical);
      if (['rankedin.com', 'www.rankedin.com'].includes(url.hostname) && url.protocol === 'https:' && extractRankedinId(url.href) === rankedin_id) {
        rankedin_url = url.href;
      }
    } catch { /* use the canonical URL */ }
  }
  return {
    rankedin_id, event_name, slug, start_date, end_date, rankedin_url, is_league,
    event_dates: start_date === end_date ? formatDay(start_date) : formatDay(start_date) + ' – ' + formatDay(end_date),
    city: String(event.city ?? event.City ?? '').trim(),
    venue: String(event.club ?? event.Club ?? '').trim(),
  };
}

function providerTier(name) {
  const normal = name.toLowerCase();
  return [['fip', 'FIP event'], ['super gold', 'Super Gold'], ['s gold', 'Super Gold'],
    ['sgold', 'Super Gold'], ['major', 'Major'], ['gold', 'Gold'], ['bronze', 'Bronze'], ['key', 'Key Event']]
    .find(([term]) => normal.includes(term))?.[1];
}

export function planRankedinCalendarImport(provider, calendar) {
  const records = new Map();
  let invalid = 0;
  for (const row of provider) {
    const event = row && providerCalendarEvent(row);
    if (event) records.set(event.rankedin_id, event);
    else invalid++;
  }
  const actions = [];
  const skipped = [];
  const occupied = new Set(calendar.map(event => event.slug).filter(Boolean));
  const collisions = new Set(calendar.map(event => slugify(event.event_name || '')));
  for (const event of records.values()) {
    const matches = calendar.filter(row => calendarRankedinId(row) === event.rankedin_id);
    if (matches.length > 1 || matches[0]?.is_manual || matches[0]?.event_status === 'cancelled') {
      skipped.push({ event, reason: 'Linked record needs manual review' });
      continue;
    }
    if (matches.length === 1) {
      actions.push({ event, existing: matches[0] });
      continue;
    }
    if (occupied.has(event.slug) || collisions.has(slugify(event.event_name))) {
      skipped.push({ event, reason: 'Similar local event needs a verified RankedIn link' });
      continue;
    }
    occupied.add(event.slug);
    collisions.add(slugify(event.event_name));
    actions.push({ event, existing: null });
  }
  return { actions, skipped, invalid };
}

async function readImportsCalendar(client, signal) {
  return readAll(() => client.from('calendar').select(calendarFields).order('id'), signal);
}

export async function loadRankedinCalendarImport({ client, gateway, signal, expectedUserId, scopeId }) {
  await verifyCalendarPlatformActor({ client, expectedUserId, scopeId, isCurrent: () => !signal?.aborted });
  const config = await client.from('federations').select('slug, rankedin_events_org_id').eq('slug', 'sapa').maybeSingle();
  if (config.error) throw config.error;
  const [provider, calendar] = await Promise.all([
    gateway.events(getFederationEventsOrgId(config.data), signal),
    readImportsCalendar(client, signal),
  ]);
  return planRankedinCalendarImport(provider, calendar);
}

const valuesMatch = (first, second) => JSON.stringify(first ?? null) === JSON.stringify(second ?? null);

export async function applyRankedinCalendarImport({ client, plan, gateway, expectedUserId, scopeId, isCurrent, onAttempt, onProgress, signal }) {
  const actor = { client, expectedUserId, scopeId, isCurrent };
  await verifyCalendarPlatformActor(actor);
  const calendar = await readImportsCalendar(client, signal);
  const receipt = { inserted: 0, updated: 0, unchanged: 0, failures: [], detailWarnings: [] };
  for (const row of plan) {
    if (!isCurrent()) break;
    const { event, existing } = row;
    try {
      const exact = calendar.filter(record => calendarRankedinId(record) === event.rankedin_id);
      const latest = exact[0];
      if (existing ? exact.length !== 1 || !valuesMatch(existing, latest)
        : exact.length > 0 || calendar.some(record => record.slug === event.slug || slugify(record.event_name || '') === slugify(event.event_name))) {
        throw new Error('The Calendar changed after review.');
      }
      let details = {};
      try { details = await gateway.details(event.rankedin_id, event.is_league, signal); }
      catch {
        if (signal?.aborted) break;
        receipt.detailWarnings.push(event.event_name);
      }
      await verifyCalendarPlatformActor(actor);
      const { slug, ...summary } = event;
      if (existing) {
        if (existing.event_status === 'cancelled' || existing.is_manual) throw new Error('This linked event needs manual review.');
        const suggestedTier = providerTier(event.event_name);
        const fields = {
          ...summary,
          ...(existing.venue && !details.venue ? { venue: existing.venue } : {}),
          ...(existing.is_league ? { is_league: true } : {}),
          ...details,
          ...((!existing.sapa_status || existing.sapa_status === 'None') && suggestedTier ? { sapa_status: suggestedTier } : {}),
        };
        const changed = Object.fromEntries(Object.entries(fields).filter(([column, value]) => !valuesMatch(existing[column], value)));
        if (Object.keys(changed).length === 0) {
          receipt.unchanged++;
          continue;
        }
        const current = await client.from('calendar').select(calendarFields).eq('id', existing.id).single();
        if (current.error || !valuesMatch(existing, current.data) || !isCurrent()) {
          throw current.error || new Error('The linked event changed after review.');
        }
        let query = client.from('calendar').update(changed).eq('id', existing.id);
        for (const column of ['rankedin_id', 'rankedin_url', 'is_manual', 'event_status', 'event_name', 'slug', 'start_date', 'end_date', 'sapa_status']) {
          query = existing[column] == null ? query.is(column, null) : query.eq(column, existing[column]);
        }
        onAttempt();
        const { data, error } = await query.select('id').single();
        if (error || String(data?.id) !== String(existing.id)) throw error || new Error('Could not confirm the updated event.');
        receipt.updated++;
      } else {
        // A last exact lookup also catches earlier imports from another open tab.
        const [prior, slugMatch] = await Promise.all([
          client.from('calendar').select('id').eq('rankedin_id', event.rankedin_id).limit(1),
          client.from('calendar').select('id').eq('slug', event.slug).limit(1),
        ]);
        if (prior.error || slugMatch.error || prior.data?.length || slugMatch.data?.length || !isCurrent()) {
          throw prior.error || slugMatch.error || new Error('This event or calendar link already exists.');
        }
        onAttempt();
        const { data, error } = await client.from('calendar').insert({
          ...summary, ...details, slug, sapa_status: providerTier(event.event_name) || 'Silver',
          organiser_name: 'SAPA', is_visible: true,
        }).select('id').single();
        if (error || !data?.id) throw error || new Error('Could not confirm the new event.');
        receipt.inserted++;
        calendar.push({ ...summary, slug, id: data.id });
      }
    } catch (error) {
      receipt.failures.push({ name: event.event_name, message: error.message || 'Import could not be confirmed.' });
    } finally {
      onProgress?.(receipt.inserted + receipt.updated + receipt.unchanged + receipt.failures.length, plan.length);
    }
  }
  return receipt;
}

export function pastRankedinCalendarEvents(events) {
  return events.filter(event => Number(event.id) > 0 && calendarRankedinId(event) && eventPhase(event) === 'Past');
}

export async function refreshPastRankedinCache({ client, events, gateway, expectedUserId, scopeId, isCurrent, onAttempt, onProgress, signal }) {
  await verifyCalendarPlatformActor({ client, expectedUserId, scopeId, isCurrent });
  const receipt = { refreshed: 0, failures: [] };
  for (const event of events) {
    if (!isCurrent()) break;
    try {
      await saveCalendarRecordAction({ client, event, action: 'sync-source', gateway, expectedUserId, scopeId, isCurrent, onAttempt, signal, pastOnly: true });
      receipt.refreshed++;
    } catch (error) {
      receipt.failures.push({ name: event.event_name, message: error.message || 'Refresh could not be confirmed.' });
    }
    onProgress?.(receipt.refreshed + receipt.failures.length, events.length);
  }
  return receipt;
}
