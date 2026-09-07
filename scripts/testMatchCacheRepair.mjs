import test from 'node:test';
import assert from 'node:assert/strict';
import { repairMatchScore, preserveHistoryScores } from './lib/matchCacheRepair.js';
const match = { Info: { EventName: 'Major', Date: '14/08/2026', Challenger: { Id: 1, Name: 'A' }, Challenger1: { Id: 2, Name: 'B' }, Challenged: { Id: 3, Name: 'C' }, Challenged1: { Id: 4, Name: 'D' } }, Score: { Score: [] } };
const fixture = { Challenger: { Player1Id: 1, Player2Id: 2 }, Challenged: { Player1Id: 3, Player2Id: 4 }, MatchResult: { HasScore: true, IsPlayed: true, Score: { FirstParticipantScore: 2, SecondParticipantScore: 1, DetailedScoring: [] } } };
test('repair uses exact teams and verified published result', () => {
    const result = repairMatchScore(match, [fixture]);
    assert.deepEqual(result.Score, { Score: [{ Score1: 2, Score2: 1 }], IsSummary: true });
    assert.equal(result.Info, match.Info);
});
test('ambiguous rematches, different players and unpublished results are untouched', () => {
    assert.equal(repairMatchScore(match, [fixture, fixture]), match);
    assert.equal(repairMatchScore(match, [{ ...fixture, Challenged: { Player1Id: 3, Player2Id: 5 } }]), match);
    assert.equal(repairMatchScore(match, [{ ...fixture, MatchResult: { ...fixture.MatchResult, HasScore: false } }]), match);
});
test('scheduled sync preserves repaired scores on empty, placeholder or incomplete responses', () => {
    const repaired = repairMatchScore(match, [fixture]);
    for (const live of [[], undefined, [{ Info: { EventName: 'EventName' } }], [match]]) {
        assert.deepEqual(preserveHistoryScores(live, [repaired]), [repaired]);
    }
});
test('new published scores take precedence over old saved scores', () => {
    const published = { ...match, Score: { Score: [{ Score1: 6, Score2: 3 }] } };
    assert.deepEqual(preserveHistoryScores([published], [repairMatchScore(match, [fixture])]), [published]);
});

test('rematches can be resolved using an exact scheduled minute and court', () => {
    const cached = { ...match, Info: { ...match.Info, Date: '19/07/2026 15:30', Court: 'Court 1' } };
    const earlier = { ...fixture, Date: '2026-07-19T11:30:00', Court: 'Court 3' };
    const final = { ...fixture, Date: '2026-07-19T15:30:00', Court: 'Court 1' };
    assert.equal(repairMatchScore(cached, [earlier, final]).Score.Score[0].Score1, 2);
    assert.equal(repairMatchScore(cached, [earlier, { ...final, Court: 'Court 2' }]), cached);
});
