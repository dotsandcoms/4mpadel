import type { ProCategory, ProPerson } from './pro-padel';
import type { MatchDetails } from './pro-padel-live';
import { tournamentRoundLabel } from './pro-tournament';

export type TournamentEntry = { key: string; team: ProPerson[]; seed: number | null; seedsByDraw: Record<string, number | null>; statusesByDraw: Record<string, string>; draws: string[]; matches: MatchDetails[]; status: string };
export type JourneyStage = {
  key: string; label: string; draw: string; row: MatchDetails; outcome: 'won' | 'lost' | 'bye' | 'live' | 'upcoming' | 'possible' | 'unresolved';
  conditional: boolean; opponents: ProPerson[][]; unknownOpponent: boolean; side: number | null;
};
export type PairJourney = { entry: TournamentEntry | null; stages: JourneyStage[]; notice: string | null; winsRemaining: number | null; champion: boolean; eliminated: boolean };
const finished = new Set(['finished', 'retired', 'walkover', 'not_played']);
const drawName = (row: MatchDetails) => row.draw || 'main';
const positive = (id: number) => Number.isSafeInteger(id) && id > 0;

/** A partnership has two provider IDs; never match names, one player, or competitor UUIDs. */
export function tournamentPairKey(team: ProPerson[]): string | null {
  return team.length === 2 && team.every(player => positive(player.id)) && team[0].id !== team[1].id
    ? team.map(player => player.id).sort((a, b) => a - b).join('-') : null;
}
export function validTournamentPairKey(value: string): boolean {
  const ids = value.split('-').map(Number);
  return /^\d+-\d+$/.test(value) && ids.length === 2 && ids.every(positive) && ids[0] < ids[1];
}
const pairSide = (row: MatchDetails, key: string) => row.match.teams.findIndex(team => tournamentPairKey(team) === key);
const winnerSide = (row: MatchDetails) => row.match.winner === 'team_1' ? 0 : row.match.winner === 'team_2' ? 1 : null;
const seedNumber = (value: string | null | undefined) => /^[1-9]\d*$/.test(value || '') && Number(value) <= 128 ? Number(value) : null;
const uniqueRows = (rows: MatchDetails[], id: number, category: ProCategory) => [...new Map(rows.filter(row => row.match.tournamentId === id && row.match.category === category).map(row => [row.match.id, row])).values()];
const shortRound = (row: MatchDetails, rows: MatchDetails[]) => drawName(row) === 'main' ? ({ 1: 'Final', 2: 'SF', 4: 'QF' }[row.match.round] || `R${row.match.round * 2}`) : tournamentRoundLabel(row, rows);

export function tournamentEntries(rows: MatchDetails[], id: number, category: ProCategory): TournamentEntry[] {
  const scoped = uniqueRows(rows, id, category), entries = new Map<string, TournamentEntry>();
  for (const row of scoped) for (const team of row.match.teams) {
    const key = tournamentPairKey(team); if (!key) continue;
    const entry = entries.get(key) || { key, team, seed: null, seedsByDraw: {}, statusesByDraw: {}, draws: [], matches: [], status: 'In draw' };
    entry.matches.push(row);
    if (!entry.draws.includes(drawName(row))) entry.draws.push(drawName(row));
    entries.set(key, entry);
  }
  for (const entry of entries.values()) {
    entry.matches.sort((a, b) => Number(drawName(b) === 'main') - Number(drawName(a) === 'main') || a.match.round - b.match.round);
    for (const draw of entry.draws) {
      const relevant = entry.matches.filter(row => drawName(row) === draw);
      entry.seedsByDraw[draw] = relevant.map(row => seedNumber(row.seeds?.[pairSide(row, entry.key)])).find(seed => seed != null) ?? null;
      const loss = relevant.find(row => finished.has(row.match.status) && winnerSide(row) != null && winnerSide(row) !== pairSide(row, entry.key));
      const final = draw === 'main' && relevant.find(row => row.match.round === 1 && finished.has(row.match.status) && winnerSide(row) === pairSide(row, entry.key));
      const live = relevant.find(row => ['live', 'ongoing'].includes(row.match.status));
      const next = relevant.find(row => row.match.status === 'scheduled');
      entry.statusesByDraw[draw] = final ? 'Champions' : loss ? `Out · ${shortRound(loss, scoped)}` : live ? `Live · ${shortRound(live, scoped)}` : next ? shortRound(next, scoped) : draw === 'main' ? 'Main draw' : 'Qualifying';
    }
    const primary = entry.draws.includes('main') ? 'main' : entry.draws[0];
    entry.seed = entry.seedsByDraw[primary]; entry.status = entry.statusesByDraw[primary];
  }
  return [...entries.values()].sort((a, b) => (a.seed ?? 999) - (b.seed ?? 999) || a.team[0].name.localeCompare(b.team[0].name));
}

export function tournamentEntriesForDraw(entries: TournamentEntry[], draw: string): TournamentEntry[] {
  return entries.filter(entry => entry.draws.includes(draw)).map(entry => ({ ...entry, seed: entry.seedsByDraw[draw] ?? null, status: entry.statusesByDraw[draw] || 'In draw' }))
    .sort((a, b) => (a.seed ?? 999) - (b.seed ?? 999) || a.team[0].name.localeCompare(b.team[0].name));
}

/** Only complete, zero-indexed knockout rounds establish bracket edges. API connections.next is chronological, not a bracket edge. */
function bracket(rows: MatchDetails[]) {
  const rounds = [...new Set(rows.map(row => row.match.round))].sort((a, b) => b - a);
  const slots = new Map<string, MatchDetails>();
  if (!rounds.length || rounds.some(round => round < 1 || (round & (round - 1)) !== 0)) return null;
  for (const round of rounds) {
    const matches = rows.filter(row => row.match.round === round);
    if (matches.length !== round || new Set(matches.map(row => row.bracketIndex)).size !== round || matches.some(row => row.bracketIndex == null || row.bracketIndex < 0 || row.bracketIndex >= round)) return null;
    for (const row of matches) slots.set(`${round}:${row.bracketIndex}`, row);
  }
  if (rounds.some((round, i) => i > 0 && rounds[i - 1] !== round * 2)) return null;
  // A published parent team must come from the matching child branch. This also detects swapped slot conventions.
  for (const row of rows) for (let side = 0; side < 2; side++) {
    const child = slots.get(`${row.match.round * 2}:${row.bracketIndex! * 2 + side}`);
    const key = tournamentPairKey(row.match.teams[side]);
    if (child && key && !possibleTeams(child, slots).teams.some(team => tournamentPairKey(team) === key)) return null;
  }
  return { rounds, slots };
}
function possibleTeams(row: MatchDetails, slots: Map<string, MatchDetails>): { teams: ProPerson[][]; unknown: boolean } {
  const winner = winnerSide(row);
  if (finished.has(row.match.status) && winner != null) return { teams: tournamentPairKey(row.match.teams[winner]) ? [row.match.teams[winner]] : [], unknown: !tournamentPairKey(row.match.teams[winner]) };
  if (row.match.status === 'bye') {
    const teams = row.match.teams.filter(team => tournamentPairKey(team));
    return { teams: teams.length === 1 ? teams : [], unknown: teams.length !== 1 };
  }
  if (finished.has(row.match.status)) return { teams: [], unknown: true };
  const teams: ProPerson[][] = []; let unknown = false;
  for (let side = 0; side < 2; side++) {
    const team = row.match.teams[side];
    if (tournamentPairKey(team)) teams.push(team);
    else {
      const child = slots.get(`${row.match.round * 2}:${row.bracketIndex! * 2 + side}`);
      if (!child) unknown = true;
      else { const result = possibleTeams(child, slots); teams.push(...result.teams); unknown ||= result.unknown; }
    }
  }
  return { teams: [...new Map(teams.map(team => [tournamentPairKey(team), team])).values()], unknown };
}

export function tournamentPairJourney(rows: MatchDetails[], id: number, category: ProCategory, key: string, complete: boolean): PairJourney {
  const scoped = uniqueRows(rows, id, category), entry = tournamentEntries(scoped, id, category).find(pair => pair.key === key) || null;
  const result: PairJourney = { entry, stages: [], notice: null, winsRemaining: null, champion: false, eliminated: false };
  if (!entry) return { ...result, notice: 'This pair is not in the published draw.' };
  let verifiedMain = false;
  for (const draw of [...entry.draws].sort((a, b) => Number(a === 'main') - Number(b === 'main'))) {
    const pool = scoped.filter(row => drawName(row) === draw), own = entry.matches.filter(row => drawName(row) === draw).sort((a, b) => b.match.round - a.match.round);
    const graph = complete && ['main', 'qualy'].includes(draw) ? bracket(pool) : null;
    if (draw === 'main') verifiedMain = graph != null && graph.rounds.at(-1) === 1;
    if (!graph && ['main', 'qualy'].includes(draw)) result.notice = 'The full bracket is not verified yet. Only published matches for this pair are shown.';
    let current: MatchDetails | undefined = own[0], conditional = false;
    while (current) {
      const side = pairSide(current, key), winner = winnerSide(current), actual = side >= 0;
      let opponents: ProPerson[][] = [], unknownOpponent = true;
      if (actual) { const other = current.match.teams[1 - side]; if (tournamentPairKey(other)) { opponents = [other]; unknownOpponent = false; } }
      if (graph && !opponents.length) {
        const previous = result.stages.at(-1);
        const otherSide = actual ? 1 - side : 1 - (previous!.row.bracketIndex! % 2);
        const direct = current.match.teams[otherSide];
        if (tournamentPairKey(direct)) { opponents = [direct]; unknownOpponent = false; }
        else {
          const child = graph.slots.get(`${current.match.round * 2}:${current.bracketIndex! * 2 + otherSide}`);
          if (child) { const candidates = possibleTeams(child, graph.slots); opponents = candidates.teams; unknownOpponent = candidates.unknown; }
        }
      }
      const outcome: JourneyStage['outcome'] = actual ? current.match.status === 'bye' ? 'bye' : finished.has(current.match.status) && winner != null ? winner === side ? 'won' : 'lost' : ['live', 'ongoing'].includes(current.match.status) ? 'live' : current.match.status === 'scheduled' ? 'upcoming' : 'unresolved' : conditional ? 'possible' : 'upcoming';
      result.stages.push({ key: `${draw}:${current.match.id}`, label: tournamentRoundLabel(current, scoped), draw, row: current, outcome, conditional: actual ? false : conditional, opponents, unknownOpponent: outcome === 'bye' ? false : unknownOpponent, side: actual ? side : null });
      if (outcome === 'lost' && ['main', 'qualy'].includes(draw)) { result.eliminated = draw === 'main' || !entry.draws.includes('main'); break; }
      if (draw === 'main' && current.match.round === 1 && outcome === 'won') result.champion = true;
      conditional = !['won', 'bye'].includes(outcome);
      const nextRound: number = current.match.round / 2;
      const next: MatchDetails | undefined = graph ? graph.slots.get(`${nextRound}:${Math.floor(current.bracketIndex! / 2)}`) : own.find(row => row.match.round < current!.match.round);
      // Never show an unrelated, already-published team as this pair's future slot.
      if (graph && next && pairSide(next, key) < 0) {
        const slotTeam = next.match.teams[current.bracketIndex! % 2];
        if (tournamentPairKey(slotTeam)) { result.notice = 'The published bracket has changed. Refresh for the latest route.'; break; }
      }
      current = next;
    }
    if (result.eliminated) break;
  }
  if (!entry.draws.includes('main') && !result.eliminated) result.notice = 'Qualifying route shown. The main-draw place will appear when published.';
  if (verifiedMain && !result.eliminated) result.winsRemaining = result.stages.filter(stage => stage.draw === 'main' && !['won', 'bye'].includes(stage.outcome)).length;
  return result;
}
