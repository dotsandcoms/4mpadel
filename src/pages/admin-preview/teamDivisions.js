import { seedTeams } from '../../utils/teamSeeding.js';
import { resolveRegistrationDivision } from '../../utils/registrationDivision.js';
import { divisionRankingSource, resolvePlayerRanking } from '../../utils/playerRankingSelection.js';

export function registrationRanking(registration, divisions) {
  const division = resolveRegistrationDivision(registration, divisions);
  return resolvePlayerRanking(registration?._player || registration, divisionRankingSource(division));
}

export function currentDivisionLabel(registration, divisions, fallback = row => row?.division || '') {
  return resolveRegistrationDivision(registration, divisions)?.name || fallback(registration);
}

export function groupTeamDivisions(teams, divisions, getDivision, visibleIds, selectedDivision = 'All divisions', hideEmpty = false) {
  const groups = new Map(divisions.map(division => {
    const name = division.name || division.division_name || 'Unnamed division';
    const key = division.id != null ? `id:${division.id}` : `name:${name}`;
    return [key, { key, name, division, teams: [] }];
  }));
  teams.forEach(players => {
    const name = currentDivisionLabel(players[0], divisions, getDivision);
    const division = resolveRegistrationDivision(players[0], divisions);
    const key = division?.id != null ? `id:${division.id}` : `name:${name}`;
    if (!groups.has(key)) groups.set(key, { key, name, division: division || {}, teams: [] });
    groups.get(key).teams.push({ players });
  });
  return [...groups.values()].map(group => ({
    ...group,
    total: group.teams.length,
    rankingSource: divisionRankingSource(group.division),
    teams: seedTeams(group.teams.map(team => ({
      ...team,
      rankingSource: divisionRankingSource(group.division),
      playerPoints: team.players.map(player => registrationRanking(player, divisions).points),
    })), player => registrationRanking(player, divisions).points)
      .filter(team => team.players.some(player => visibleIds.has(String(player.id)))),
  })).filter(group => (selectedDivision === 'All divisions' || group.name === selectedDivision)
    && (!hideEmpty || group.teams.length > 0));
}
