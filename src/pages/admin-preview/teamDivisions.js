import { seedTeams } from '../../utils/teamSeeding.js';

export function groupTeamDivisions(teams, divisions, getDivision, visibleIds, selectedDivision = 'All divisions', hideEmpty = false) {
  const groups = new Map(divisions.map(division => {
    const name = division.name || division.division_name || 'Unnamed division';
    return [name, { name, division, teams: [] }];
  }));
  teams.forEach(players => {
    const name = getDivision(players[0]);
    if (!groups.has(name)) groups.set(name, { name, division: {}, teams: [] });
    groups.get(name).teams.push({ players });
  });
  return [...groups.values()].map(group => ({
    ...group,
    total: group.teams.length,
    teams: seedTeams(group.teams, player => Number(player._player?.points || 0))
      .filter(team => team.players.some(player => visibleIds.has(String(player.id)))),
  })).filter(group => (selectedDivision === 'All divisions' || group.name === selectedDivision)
    && (!hideEmpty || group.teams.length > 0));
}
