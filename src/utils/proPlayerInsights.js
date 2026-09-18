import { playerResult } from './proPadelView.js';

// All metrics describe the supplied selection, never a player's complete career.
export function playerInsights(matches, playerId) {
  const selected = [...new Map(matches.filter((match) => match.teams.some((team) => team.some((person) => person.id === playerId))).map((match) => [match.id, match])).values()]
    .sort((a, b) => (b.playedAt || '').localeCompare(a.playedAt || '') || a.round - b.round);
  const played = selected.filter((match) => playerResult(match, playerId));
  const wins = played.filter((match) => playerResult(match, playerId) === 'W').length;
  const partners = new Map();
  const events = new Map();
  const scores = { setsWon: 0, setsLost: 0, gamesWon: 0, gamesLost: 0, matches: 0 };
  for (const match of played) {
    const teamIndex = match.teams.findIndex((team) => team.some((person) => person.id === playerId));
    const won = playerResult(match, playerId) === 'W';
    for (const person of match.teams[teamIndex].filter((person) => person.id !== playerId)) {
      const partner = partners.get(person.id) || { ...person, played: 0, wins: 0 };
      partner.played++; partner.wins += Number(won); partners.set(person.id, partner);
    }
    const event = events.get(match.tournamentId) || { id: match.tournamentId, name: match.tournamentName, round: match.round, wins: 0, losses: 0, champion: false };
    event.round = Math.min(event.round, match.round);
    event.wins += Number(won); event.losses += Number(!won);
    event.champion ||= match.round === 1 && won && match.status === 'finished';
    events.set(event.id, event);
    // Retirements and partial/invalid scorelines cannot establish a full set record.
    if (match.status !== 'finished' || !match.score?.length) continue;
    const parsed = match.score.map((set) => set.map((value) => /^\d+(?:\(\d+\))?$/.test(String(value)) ? parseInt(value, 10) : NaN));
    const complete = parsed.every((set) => {
      if (set.length !== 2 || !set.every(Number.isFinite)) return false;
      const high = Math.max(...set), low = Math.min(...set);
      return high === 6 && low <= 4 || high === 7 && [5, 6].includes(low);
    });
    const teamOneSets = parsed.filter((set) => set[0] > set[1]).length;
    const teamTwoSets = parsed.filter((set) => set[1] > set[0]).length;
    const validMatch = parsed.length >= 2 && parsed.length <= 3 && (match.winner === 'team_1' ? teamOneSets === 2 && teamTwoSets < 2 : teamTwoSets === 2 && teamOneSets < 2);
    if (!complete || !validMatch) continue;
    scores.matches++;
    for (const set of parsed) {
      const own = set[teamIndex], other = set[1 - teamIndex];
      scores.setsWon += Number(own > other); scores.setsLost += Number(own < other);
      scores.gamesWon += own; scores.gamesLost += other;
    }
  }
  return { played: played.length, wins, losses: played.length - wins, winRate: played.length ? Math.round(wins / played.length * 100) : null,
    form: played.slice(0, 6).map((match) => ({ id: match.id, result: playerResult(match, playerId), event: match.tournamentName, date: match.playedAt })),
    partners: [...partners.values()].sort((a, b) => b.played - a.played || b.wins - a.wins || a.name.localeCompare(b.name)),
    events: [...events.values()], scores };
}
