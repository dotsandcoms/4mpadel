import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedTeams } from '../../src/utils/teamSeeding.js';
import { groupTeamDivisions } from '../../src/pages/admin-preview/teamDivisions.js';

const team = (id, division, points) => [{ id, division, _player: { points } }];
const teams = [team('hamza', 'Open', 2973), team('advanced', 'Advanced', 188), team('james', 'Open', 5474), team('adam', 'Open', 21468), team('zero', 'Open', 0)];
const divisions = [{ name: 'Open' }, { name: 'Advanced' }, { name: 'Mixed' }];
const visible = new Set(teams.flat().map(player => player.id));
test('groups divisions and seeds highest combined points first, including empty divisions', () => {
  const groups = groupTeamDivisions(teams, divisions, row => row.division, visible);
  assert.deepEqual(groups.map(group => group.name), ['Open', 'Advanced', 'Mixed']);
  assert.deepEqual(groups[0].teams.map(team => [team.players[0].id, team.seed]), [['adam', 1], ['james', 2], ['hamza', 3], ['zero', null]]);
  assert.equal(groups[1].teams[0].seed, 1);
  assert.equal(groups[2].total, 0);
});
test('search and licence filtering preserve the original division seed', () => {
  const groups = groupTeamDivisions(teams, divisions, row => row.division, new Set(['hamza']), 'Open', true);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].teams[0].seed, 3);
  assert.equal(groups[0].total, 4);
});
test('shared seeding sums both players, preserves ties and does not mutate input', () => {
  const rows = [{ id: 'a', players: [4, 6] }, { id: 'b', players: [20, 5] }, { id: 'c', players: [10] }];
  assert.deepEqual(seedTeams(rows, value => value).map(team => [team.id, team.totalPoints, team.seed]), [['b', 25, 1], ['a', 10, 2], ['c', 10, 3]]);
  assert.equal(rows[0].seed, undefined);
});
test('all teams remain available beyond 50 and unknown divisions are retained', () => {
  const many = Array.from({ length: 60 }, (_, i) => team(String(i), 'Other', i));
  assert.equal(groupTeamDivisions(many, divisions, row => row.division, new Set(many.flat().map(p => p.id))).at(-1).teams.length, 60);
});
