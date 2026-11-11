import type { EventDetail } from './events';
import type { RankedPlayer } from './event-teams';
import { rankedinEventId } from './event-draws';
import { fetchTournamentDraw, fetchTournamentDrawChoices } from './tournament-draw-data';
import type { DrawChoice, DrawMatch } from './tournament-draw';

export type MatchUpdateChoice = DrawChoice & { source: 'native' | 'rankedin'; key: string };
export type EventMatchUpdate = { key: string; eventId: number; choice: MatchUpdateChoice; round: string; match: DrawMatch };
export type MatchUpdateCatalog = { eventId: number; choices: MatchUpdateChoice[]; warning: string | null };
export type MatchUpdateBatch = { items: EventMatchUpdate[]; next: number; warning: string | null; stale: boolean };
const BATCH = 2;
function requirePublicEvent(event: EventDetail) {
  if (!Number.isSafeInteger(event.id) || event.id <= 0 || event.is_visible !== true || event.registration_access && event.registration_access !== 'public'
    || event.sanction_status && event.sanction_status !== 'approved') throw new Error('Published match updates are unavailable for this event.');
}
const sourceLabel = (source: MatchUpdateChoice['source']) => source === 'native' ? '4M' : 'RankedIn';

/** Read the same published choices as Draws/Results. Never infer a class from another event. */
export async function fetchMatchUpdateCatalog(event: EventDetail): Promise<MatchUpdateCatalog> {
  requirePublicEvent(event);
  const sources: MatchUpdateChoice['source'][] = ['native', ...(rankedinEventId(event) ? ['rankedin' as const] : [])];
  const results = await Promise.allSettled(sources.map(source => fetchTournamentDrawChoices(event, source)));
  const choices: MatchUpdateChoice[] = [], failed: string[] = [];
  results.forEach((result, index) => {
    const source = sources[index];
    if (result.status === 'rejected') { failed.push(sourceLabel(source)); return; }
    for (const choice of result.value) choices.push({ ...choice, source, key: `${source}:${choice.id}` });
  });
  if (failed.length === sources.length) throw new Error('Published matches could not load. Please retry.');
  // Give each available source a place in the first batch of hybrid events.
  choices.sort((a, b) => Number(a.source !== sources[0]) - Number(b.source !== sources[0]));
  const firstOther = choices.findIndex(choice => choice.source !== choices[0]?.source);
  if (firstOther > 1) choices.splice(1, 0, choices.splice(firstOther, 1)[0]);
  return { eventId: event.id, choices: [...new Map(choices.map(choice => [choice.key, choice])).values()], warning: failed.length ? `${failed.join(' and ')} match updates could not refresh. Other published matches are shown.` : null };
}

/** Only real published fixtures/results: omit empty future bracket slots and cancelled matches. */
export function matchUpdatesFromDraw(eventId: number, choice: MatchUpdateChoice, sections: Awaited<ReturnType<typeof fetchTournamentDraw>>['sections']): EventMatchUpdate[] {
  const unique = new Map<string, EventMatchUpdate>();
  for (const section of sections) for (const round of section.rounds) for (const match of round.matches) {
    if (match.status === 'Cancelled' || !match.one.players.length && !match.two.players.length) continue;
    if (!match.completed && (!match.one.players.length || !match.two.players.length)) continue;
    const key = `${eventId}:${choice.source}:${match.id}`;
    if (!unique.has(key)) unique.set(key, { key, eventId, choice, round: `${section.name} · ${round.name}`, match });
  }
  return [...unique.values()];
}

export function sortMatchUpdates(items: EventMatchUpdate[]) {
  const priority = (item: EventMatchUpdate) => item.match.status === 'Live' ? 0 : item.match.completed ? 2 : 1;
  return [...new Map(items.map(item => [item.key, item])).values()].sort((a, b) => {
    const status = priority(a) - priority(b);
    if (status) return status;
    const at = Date.parse(a.match.start || ''), bt = Date.parse(b.match.start || '');
    if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return a.match.completed ? bt - at : at - bt;
    if (Number.isFinite(at) !== Number.isFinite(bt)) return Number.isFinite(at) ? -1 : 1;
    return a.choice.name.localeCompare(b.choice.name) || b.match.round - a.match.round || a.match.order - b.match.order || a.key.localeCompare(b.key);
  });
}

/** At most two draw requests at once, using the shared RankedIn gateway/cache. */
export async function fetchMatchUpdateBatch(event: EventDetail, directory: RankedPlayer[], catalog: MatchUpdateCatalog, offset = 0): Promise<MatchUpdateBatch> {
  requirePublicEvent(event);
  if (catalog.eventId !== event.id) throw new Error('Match updates belong to a different event.');
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > catalog.choices.length) throw new Error('Invalid match update page.');
  const choices = catalog.choices.slice(offset, offset + BATCH);
  const results = await Promise.allSettled(choices.map(choice => fetchTournamentDraw(event, choice.source, choice, directory)));
  const items: EventMatchUpdate[] = [], failed: string[] = [];
  let stale = false;
  results.forEach((result, index) => {
    if (result.status === 'rejected') { failed.push(choices[index].name); return; }
    stale ||= result.value.stale;
    items.push(...matchUpdatesFromDraw(event.id, choices[index], result.value.sections));
  });
  if (choices.length && failed.length === choices.length) throw new Error('These published matches could not load. Please retry.');
  return { items: sortMatchUpdates(items), next: offset + choices.length, stale,
    warning: failed.length ? 'Some draws could not refresh. View the full draws or retry for the remaining matches.' : catalog.warning };
}
