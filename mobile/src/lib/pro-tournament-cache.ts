import type { ProTournament } from './pro-padel';
import type { MatchDetails } from './pro-padel-live';

export type TournamentSnapshot = { event: ProTournament | null; matches: MatchDetails[]; complete: boolean; loadedAt: number };
// Public sports data only. A pair opens instantly from the already-loaded draw; no extra calls per pair.
const snapshots = new Map<number, TournamentSnapshot>();
export function rememberTournament(id: number, value: Omit<TournamentSnapshot, 'loadedAt'>) {
  snapshots.delete(id); snapshots.set(id, { ...value, loadedAt: Date.now() });
  if (snapshots.size > 6) snapshots.delete(snapshots.keys().next().value!);
}
export const readTournament = (id: number) => snapshots.get(id);
