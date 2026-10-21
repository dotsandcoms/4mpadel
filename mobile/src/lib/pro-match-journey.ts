import type { PointFeed } from '@/lib/pro-padel-live';

const games = (value: string | null) => { const result = /^(\d+)\s*[-:]\s*(\d+)$/.exec(value || ''); return result ? result.slice(1).map(Number) : null; };
const pointValue = (value: string) => ({ '0': 0, '15': 1, '30': 2, '40': 3, AD: 4, A: 4 }[value.toUpperCase()] ?? (Number.isFinite(Number(value)) ? Number(value) : null));
/** Count observed score transitions only. Missing points and unrecorded game winners are never invented. */
export function matchJourney(feed: PointFeed | null) {
  return (feed?.sets || []).map(set => ({ number: set.set_number, score: set.set_score, games: set.games.map((game, index) => {
    const before = games(game.game_score), after = games(set.games[index + 1]?.game_score || set.set_score);
    const tiebreak = before?.[0] === 6 && before?.[1] === 6;
    const winner: 0 | 1 | null = before && after && after[0] === before[0] + 1 && after[1] === before[1] ? 0
      : before && after && after[1] === before[1] + 1 && after[0] === before[0] ? 1 : null;
    const points: [number, number] = [0, 0];
    let prior: (number | null)[] = [0, 0];
    for (const score of game.points) {
      const pair = score.split(/\s*[:\-]\s*/);
      if (pair.length !== 2) continue;
      const next = pair.map(value => tiebreak ? Number.isFinite(Number(value)) ? Number(value) : null : pointValue(value));
      if (next.some(value => value == null) || prior.some(value => value == null)) { prior = next; continue; }
      if (next[0]! > prior[0]! && next[1]! <= prior[1]!) points[0]++;
      else if (next[1]! > prior[1]! && next[0]! <= prior[0]!) points[1]++;
      else if (prior[0] === 4 && prior[1] === 3 && next[0] === 3 && next[1] === 3) points[1]++;
      else if (prior[1] === 4 && prior[0] === 3 && next[1] === 3 && next[0] === 3) points[0]++;
      prior = next;
    }
    return { number: game.game_number || index + 1, points, winner, break: !tiebreak && winner != null && game.serving === (winner === 0 ? 'team_2' : 'team_1') };
  }) }));
}
