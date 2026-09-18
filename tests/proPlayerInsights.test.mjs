import test from 'node:test';
import assert from 'node:assert/strict';
import { playerInsights } from '../src/utils/proPlayerInsights.js';
const base = { id: 1, status: 'finished', winner: 'team_1', round: 1, playedAt: '2026-09-13', tournamentId: 10, tournamentName: 'Paris', teams: [[{id:66,name:'Player'},{id:65,name:'Partner'}],[{id:114,name:'Opponent'},{id:115,name:'Other'}]], score:[['6','4'],['7','6(5)']] };

test('form deduplicates shared matches and derives team-relative set and game records', () => {
  const stats = playerInsights([base,base], 66);
  assert.equal(stats.played, 1); assert.equal(stats.winRate, 100);
  assert.deepEqual(stats.scores, {setsWon:2,setsLost:0,gamesWon:13,gamesLost:10,matches:1});
  assert.deepEqual(stats.partners,[{id:65,name:'Partner',played:1,wins:1}]);
  assert.equal(stats.events[0].champion,true);
  const opposite = playerInsights([base], 114);
  assert.equal(opposite.losses,1);assert.equal(opposite.events[0].champion,false);
  assert.deepEqual(opposite.scores,{setsWon:0,setsLost:2,gamesWon:10,gamesLost:13,matches:1});
});
test('excludes walkovers, byes, scheduled and unconfirmed scores; retirements count only in played record', () => {
  const rows = ['walkover','bye','scheduled','ended','retired'].map((status,id)=>({...base,id,status}));
  const stats=playerInsights(rows,66);
  assert.equal(stats.played,1);assert.equal(stats.scores.matches,0);assert.equal(stats.events[0].champion,false);
});
test('partial or inconsistent finished scorelines cannot inflate sets or games', () => {
  const stats=playerInsights([
    {...base,id:2,score:[['6','4']]},
    {...base,id:3,score:[['6','4'],['3','2']]},
    {...base,id:4,score:[['6','4'],['7','6']],winner:'team_2'},
    {...base,id:5,score:[['hidden_free_plan','4'],['7','6']]},
  ],66);
  assert.equal(stats.played,4);assert.equal(stats.scores.matches,0);
});
test('orders recent form newest first, caps form to six, and tracks partner changes',()=>{
  const older={...base,id:2,playedAt:'2026-09-02',tournamentId:9,tournamentName:'Madrid',round:4,winner:'team_2',teams:[[{id:66,name:'Player'},{id:7,name:'Former partner'}],base.teams[1]]};
  const stats=playerInsights([older,base,...Array.from({length:6},(_,i)=>({...base,id:i+3,round:4,playedAt:`2026-08-${10+i}`}))],66);
  assert.equal(stats.form.length,6);assert.equal(stats.form[0].id,1);assert.equal(stats.form[1].result,'L');
  assert.equal(stats.partners.length,2);assert.equal(stats.events.find(e=>e.id===9).round,4);
  assert.equal(playerInsights([base],999).winRate,null);
  assert.deepEqual(playerInsights([],66).form,[]);
});
