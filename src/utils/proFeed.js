export function followedMatches(matches, follows) {
  const ids = new Set(follows.map((row) => Number(row.player_id)));
  return [...new Map(matches.filter((match) => match.teams.some((team) => team.some((player) => ids.has(Number(player.id))))).map((match) => [match.id, match])).values()]
    .sort((a, b) => (b.playedAt || '').localeCompare(a.playedAt || '') || a.round - b.round);
}
