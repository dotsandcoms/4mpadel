export function tournamentJourneys(matches, playerId) {
  const events = new Map();
  const seen = new Set();
  for (const match of matches || []) {
    if (seen.has(match.id) || !match.teams.some((team) => team.some((person) => person.id === playerId))) continue;
    seen.add(match.id);
    const key = match.tournamentId;
    if (!events.has(key)) events.set(key, { id: key, name: match.tournamentName, matches: [], date: '' });
    const event = events.get(key);
    event.matches.push(match);
    if ((match.playedAt || '') > event.date) event.date = match.playedAt;
  }
  return [...events.values()].map((event) => ({ ...event, matches: event.matches.sort((a, b) => b.round - a.round || (a.playedAt || '').localeCompare(b.playedAt || '')) })).sort((a, b) => b.date.localeCompare(a.date));
}
