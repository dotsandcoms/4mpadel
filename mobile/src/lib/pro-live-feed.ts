import type { PointFeed, PointSet } from './pro-padel-live';

export const gameScorePair = (value: string | null) => {
  const found = /^(\d+)\s*[-:]\s*(\d+)$/.exec(value || '');
  return found ? [Number(found[1]), Number(found[2])] as const : null;
};
/** Only adjacent, single-game changes establish a winner; incomplete coverage does not. */
export function recordedGameWinner(set: PointSet, index: number): 0 | 1 | null {
  const game = set.games[index], next = set.games[index + 1];
  if (next && next.game_number !== game.game_number + 1) return null;
  const before = gameScorePair(game.game_score), after = gameScorePair(next ? next.game_score : set.set_score);
  if (!before || !after) return null;
  return after[0] === before[0] + 1 && after[1] === before[1] ? 0
    : after[1] === before[1] + 1 && after[0] === before[0] ? 1 : null;
}
const tennisPoints = ['0', '15', '30', '40', 'A'];
/** A skipped point, malformed score or correction is never attributed to a player. */
export function recordedPointWinner(previous: string | undefined, current: string, tiebreak: boolean): 0 | 1 | null {
  if (!previous) return null;
  const parse = (v: string) => v.toUpperCase().replaceAll('AD', 'A').split(/\s*[:\-]\s*/);
  const before = parse(previous), after = parse(current);
  if (before.length !== 2 || after.length !== 2) return null;
  const nums = (pair: string[]) => pair.map(p => tiebreak ? /^\d+$/.test(p) ? Number(p) : NaN : tennisPoints.indexOf(p));
  const a = nums(before), b = nums(after);
  if ([...a, ...b].some(v => !Number.isFinite(v) || v < 0)) return null;
  if (!tiebreak && a[0] === 4 && a[1] === 3 && b[0] === 3 && b[1] === 3) return 1;
  if (!tiebreak && a[1] === 4 && a[0] === 3 && b[0] === 3 && b[1] === 3) return 0;
  return b[0] === a[0] + 1 && b[1] === a[1] ? 0 : b[1] === a[1] + 1 && b[0] === a[0] ? 1 : null;
}
export function liveFeedGames(feed: PointFeed | null, selectedSet = 0) {
  return [...(feed?.sets || [])].sort((a, b) => b.set_number - a.set_number).filter(set => !selectedSet || selectedSet === set.set_number)
    .flatMap(set => set.games.map((game, index) => ({ set, game, winner: recordedGameWinner(set, index),
      current: ['live', 'ongoing'].includes(feed?.status || '') && !set.set_score && set === feed?.sets[feed.sets.length - 1] && index === set.games.length - 1,
      key: `${set.set_number}:${game.game_number}` })).reverse());
}

/** A REST cache snapshot must not roll back a newer pushed score. */
export function newestPointFeed(previous: PointFeed | null, snapshot: PointFeed): PointFeed {
  const before = Date.parse(previous?.freshness?.updatedAt || ''), next = Date.parse(snapshot.freshness?.updatedAt || '');
  return previous && Number.isFinite(before) && Number.isFinite(next) && before > next ? previous : snapshot;
}

/** Cumulative score after a known adjacent game; never label the pre-game score as its result. */
export function recordedGameEndScore(set: PointSet, index: number): string | null {
  if (recordedGameWinner(set, index) === null) return null;
  return set.games[index + 1] ? set.games[index + 1].game_score : set.set_score;
}
