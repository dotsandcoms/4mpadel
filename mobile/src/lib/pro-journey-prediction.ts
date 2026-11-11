import type { ProPerson } from './pro-padel';
import { fetchMatchPrediction, type MatchDetails } from './pro-padel-live';
import { tournamentPairKey, type JourneyStage, type TournamentEntry } from './pro-tournament-entries';

/** Choose a transparent seed-based projection, not a fabricated confirmed opponent. */
export function projectedOpponent(stage: JourneyStage, entries: TournamentEntry[]): ProPerson[] | null {
  const seeds = new Map(entries.map(entry => [entry.key, entry.seedsByDraw[stage.draw] ?? Infinity]));
  return [...stage.opponents].sort((a, b) => (seeds.get(tournamentPairKey(a)!) ?? Infinity) - (seeds.get(tournamentPairKey(b)!) ?? Infinity) || tournamentPairKey(a)!.localeCompare(tournamentPairKey(b)!))[0] || null;
}
const cache = new Map<string, { until: number; value: number | null }>();
export const winEstimateLabel = (value: number) => value > 99 && value < 100 ? '>99%' : value > 0 && value < 1 ? '<1%' : `${Math.round(value)}%`;
const pending = new Map<string, { request: Promise<number | null>; listeners: (() => boolean)[] }>();
let queue = Promise.resolve();
/** Serial, deduplicated and cached: at most one simulation in flight, independent of the draw render. */
export function journeyWinEstimate(row: MatchDetails, team: ProPerson[], opponent: ProPerson[], date: string, needed: () => boolean = () => true): Promise<number | null> {
  const own = tournamentPairKey(team), other = tournamentPairKey(opponent);
  if (!own || !other || new Set([...team, ...opponent].map(player => player.id)).size !== 4 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return Promise.resolve(null);
  const key = `${own}:${other}:${date}`;
  const saved = cache.get(key); if (saved && saved.until > Date.now()) return Promise.resolve(saved.value);
  const existing = pending.get(key);
  if (existing) { existing.listeners.push(needed); return existing.request; }
  const listeners = [needed], stillNeeded = () => listeners.some(receive => receive());
  const request = queue.then(async () => {
    if (!stillNeeded()) return null;
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (!stillNeeded()) return null;
    const prediction = await fetchMatchPrediction({ ...row, match: { ...row.match, teams: [team, opponent], playedAt: date } });
    const value = prediction?.team1;
    const result = value != null && Number.isFinite(value) && value >= 0 && value <= 100 && prediction!.team2 >= 0 && prediction!.team2 <= 100 && Math.abs(value + prediction!.team2 - 100) <= 1 ? value : null;
    cache.set(key, { value: result, until: Date.now() + (result == null ? 60000 : 3600000) });
    if (cache.size > 160) cache.delete(cache.keys().next().value!);
    return result;
  });
  queue = request.then(() => {}, () => {});
  pending.set(key, { request, listeners });
  void request.then(() => pending.delete(key), () => pending.delete(key));
  return request;
}
