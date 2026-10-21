import { playerResult } from './proPadelView.js';

export function comparisonPlayers(players, firstId, secondId) {
  const first = players.find((player) => String(player.id) === String(firstId)) || players[0];
  const second = players.find((player) => String(player.id) === String(secondId) && player.id !== first?.id) || players.find((player) => player.id !== first?.id);
  return [first, second];
}

export function directMeetings(matches, firstId, secondId) {
  if (firstId === secondId) return { matches: [], firstWins: 0, secondWins: 0 };
  const meetings = [...new Map(matches.filter((match) => {
    const firstTeam = match.teams.findIndex((team) => team.some((player) => player.id === firstId));
    const secondTeam = match.teams.findIndex((team) => team.some((player) => player.id === secondId));
    return firstTeam >= 0 && secondTeam >= 0 && firstTeam !== secondTeam && Boolean(playerResult(match, firstId));
  }).map((match) => [match.id, match])).values()].sort((a, b) => (b.playedAt || '').localeCompare(a.playedAt || '') || a.round - b.round);
  const firstWins = meetings.filter((match) => playerResult(match, firstId) === 'W').length;
  return { matches: meetings, firstWins, secondWins: meetings.length - firstWins };
}
