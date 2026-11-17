const ids = players => Array.isArray(players) && players.length === 2 && players.every(player => Number.isSafeInteger(player?.id) && player.id > 0 && player.self === `/api/players/${player.id}`)
  ? players.map(player => player.id).sort((a, b) => a - b) : null;
const same = (actual, expected) => actual && Array.isArray(expected) && expected.length === 2 && actual.join(':') === [...expected].sort((a, b) => a - b).join(':');

/** Attach probabilities only to the four players and historical reference actually returned by the provider. */
export function projectPadelPrediction(value, input) {
  const first = ids(value?.players?.team_1), second = ids(value?.players?.team_2);
  const date = typeof value?.played_at === 'string' ? value.played_at.slice(0, 10) : null;
  const people = ['team_1', 'team_2'].flatMap(team => Array.isArray(value?.players?.[team]) ? value.players[team] : []);
  const categories = new Set(people.map(player => player.category));
  const probability = value?.probability;
  if (!same(first, input.team_1) || !same(second, input.team_2) || new Set([...(first || []), ...(second || [])]).size !== 4 || date !== input.played_at ||
    categories.size !== 1 || !['men', 'women'].includes([...categories][0]) ||
    ![probability?.team_1, probability?.team_2].every(number => Number.isFinite(number) && number >= 0 && number <= 100) || Math.abs(probability.team_1 + probability.team_2 - 100) > .1) {
    throw new Error('The win estimate could not be matched to these players and reference date.');
  }
  return { probability: { team_1: probability.team_1, team_2: probability.team_2 },
    eloDiff: Number.isFinite(value.elo_diff) ? value.elo_diff : null,
    teams: { team_1: first, team_2: second }, referenceDate: date, category: [...categories][0], source: 'padel-api', model: 'elo' };
}
