import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
    areRankedinResultsPublished,
    hasVerifiedRankedinWinners,
    rankedinWinnersFromStandings,
} from '../src/utils/rankedinTournamentResults.js';

const division = { Id: 178811, Name: "Men's Open" };
const unpublished = { TournamentId: 75512, IsFinished: false, Classes: [division], Rankings: [{ Id: 15809 }] };
const published = { ...unpublished, IsFinished: true };
const results = { Data: [
    { Standing: 2, StandingRangeTo: 0, Player1Name: 'Runner up one', Player2Name: 'Runner up two' },
    { Standing: 1, StandingRangeTo: 0, Player1Name: 'Champion one', Player2Name: 'Champion two' },
    { Standing: 3, StandingRangeTo: 4, Player1Name: 'Semifinalist one', Player2Name: 'Semifinalist two' },
    { Standing: 3, StandingRangeTo: 4, Player1Name: 'Semifinalist three', Player2Name: 'Semifinalist four' },
] };

test('adidas remains unpublished even when its date has passed and match results exist', () => {
    assert.equal(areRankedinResultsPublished(unpublished), false);
    assert.equal(rankedinWinnersFromStandings(unpublished, division, results), null);
});

test('missing or invalid publication status cannot release final results', () => {
    for (const standings of [null, {}, { IsFinished: 'true' }, { IsActive: false }]) {
        assert.equal(areRankedinResultsPublished(standings), false);
        assert.equal(rankedinWinnersFromStandings(standings, division, results), null);
    }
});

test('published standings use explicit placement rather than array or draw order', () => {
    const winner = rankedinWinnersFromStandings(published, division, results);
    assert.equal(winner.Winner.Name, 'Champion one & Champion two');
    assert.equal(winner.RunnerUp.Name, 'Runner up one & Runner up two');
    assert.equal(winner.ThirdPlace.Name, 'Semifinalist one & Semifinalist two');
    assert.equal(winner.FourthPlace.Name, 'Semifinalist three & Semifinalist four');
    assert.equal(winner.CategoryName, "Men's Open");
    assert.equal(winner.resultSource, 'rankedin-standings');
});

test('a shared first-place range or multiple first places cannot become a champion', () => {
    const first = results.Data[1];
    assert.equal(rankedinWinnersFromStandings(published, division, { Data: [{ ...first, StandingRangeTo: 2 }] }), null);
    assert.equal(rankedinWinnersFromStandings(published, division, { Data: [first, { ...first, Player1Name: 'Another team' }] }), null);
});

test('missing winners and placeholder participants stay pending', () => {
    for (const payload of [null, { Data: [] }, { Data: [results.Data[0]] },
        { Data: [{ Standing: 1, Player1Name: 'Pending', Player2Name: 'A player' }] },
        { Data: [{ Standing: 1 }] }]) {
        assert.equal(rankedinWinnersFromStandings(published, division, payload), null);
    }
});

test('published singles remain supported', () => {
    const winner = rankedinWinnersFromStandings(published, division, { Data: [{ Standing: 1, Player1Name: 'Solo champion' }] });
    assert.equal(winner.Winner.Name, 'Solo champion');
    assert.equal(winner.RunnerUp, null);
});

test('legacy inferred winners must be refreshed before reusing the cache', () => {
    assert.equal(hasVerifiedRankedinWinners({ has_results: true, winners: [{ Winner: { Name: 'Quarterfinal winner' } }] }), false);
    const winners = [rankedinWinnersFromStandings(published, division, results)];
    assert.equal(hasVerifiedRankedinWinners({ has_results: true, winners }), true);
    assert.equal(hasVerifiedRankedinWinners({ has_results: false, winners }), false);
    assert.equal(hasVerifiedRankedinWinners({ has_results: true, winners: [] }), false);
});

const hookSource = fs.readFileSync(new URL('../src/hooks/useRankedin.js', import.meta.url), 'utf8');
const callbackStart = hookSource.indexOf('    const getTournamentWinners = useCallback(');
const callbackEnd = hookSource.indexOf('\n    /**', callbackStart);
const callbackSource = hookSource.slice(callbackStart, callbackEnd);

function winnersHook(standings, fetchWithCache) {
    const context = {
        useCallback: (callback) => callback,
        getTournamentStandings: async () => standings,
        areRankedinResultsPublished,
        rankedinWinnersFromStandings,
        fetchWithCache,
        API_BASE: 'https://api.rankedin.com/v1',
        console,
    };
    return vm.runInNewContext(callbackSource + '\ngetTournamentWinners;', context);
}

test('unpublished tournaments never request draw or result data to infer a winner', async () => {
    const callback = winnersHook(unpublished, async () => { assert.fail('Unpublished results must not be requested'); });
    assert.equal((await callback(75512)).length, 0);
});

test('the winners hook reads the official results endpoint after publication', async () => {
    const urls = [];
    const callback = winnersHook(published, async (url) => { urls.push(url); return results; });
    const winners = await callback(75512);
    assert.equal(winners.length, 1);
    assert.equal(winners[0].Winner.Name, 'Champion one & Champion two');
    assert.deepEqual(urls, [
        'https://api.rankedin.com/v1/tournament/GetResultsAsync?tournamentId=75512&classId=178811&rankingId=15809&language=en',
    ]);
});
