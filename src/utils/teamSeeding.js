// Shared with the existing Event Manager: positive-point teams are seeded,
// highest total first; zero-point teams remain unseeded at the end.
export function seedTeams(teams, getPlayerPoints) {
  const enriched = teams.map(team => ({
    ...team,
    totalPoints: team.players.reduce((sum, player) => sum + getPlayerPoints(player), 0),
  }));
  const ranked = enriched.filter(team => team.totalPoints > 0)
    .sort((a, b) => b.totalPoints - a.totalPoints);
  const seeds = new Map(ranked.map((team, index) => [team, index + 1]));
  return enriched.map(team => ({ ...team, seed: seeds.get(team) || null }))
    .sort((a, b) => {
      if (a.seed && b.seed) return a.seed - b.seed;
      if (a.seed) return -1;
      if (b.seed) return 1;
      return b.totalPoints - a.totalPoints;
    });
}
