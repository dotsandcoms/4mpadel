import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { publicRankedinClasses, publicRankedinMatches, publicRankedinResultsCache, requiresRankedinPublication } from '../src/utils/rankedinDrawPublication.js';

const draft = { Id: 178290, Name: 'Elite', ShowDraws: true, IsPublished: false, TournamentDraws: [{ Id: 647220, Stage: 0, Strength: 0 }] };
const published = { ...draft, Id: 178291, Name: 'Ladies', IsPublished: true };

test('SA Nationals draft draws stay hidden despite ShowDraws being true', () => {
    const classes = publicRankedinClasses('75314', [draft]);
    assert.deepEqual(classes[0].TournamentDraws, []);
    assert.equal(classes[0].ShowDraws, false);
    assert.equal(draft.TournamentDraws.length, 1);
});

test('published SA Nationals divisions become available independently', () => {
    const classes = publicRankedinClasses(75314, [draft, published]);
    assert.equal(classes[0].TournamentDraws.length, 0);
    assert.deepEqual(classes[1], published);
});

test('old cache flags and bye results cannot advertise unpublished SA Nationals draws', () => {
    const row = { classes: [draft], has_draw: true, has_results: true, winners: [{ name: 'Bye winner' }], upcoming_matches: [{ id: 1 }] };
    const result = publicRankedinResultsCache('75314', row);
    assert.equal(result.has_draw, false);
    assert.equal(result.has_results, false);
    assert.deepEqual(result.winners, []);
    assert.deepEqual(result.upcoming_matches, []);
});

test('cached publication restores the public draw once RankedIn publishes it', () => {
    const result = publicRankedinResultsCache('75314', { classes: [published], has_draw: false, has_results: false });
    assert.equal(result.has_draw, true);
});

test('unpublished fixtures are hidden even when the API returns match data', () => {
    assert.deepEqual(publicRankedinMatches('75314', { AreMatchesPublished: false, Matches: [{ TournamentClassName: 'Ladies' }] }, [published]), []);
});

test('published fixtures include only released divisions', () => {
    const visible = { TournamentClassName: 'Ladies' };
    assert.deepEqual(publicRankedinMatches('75314', { AreMatchesPublished: true, Matches: [{ TournamentClassName: 'Elite' }, visible] }, [draft, published]), [visible]);
});

for (const tournamentId of ['75763', 75763, '12345']) {
    test(`${tournamentId}: draft draws and stale cache flags cannot publish a draw`, () => {
        assert.equal(requiresRankedinPublication(tournamentId), true);
        const classes = publicRankedinClasses(tournamentId, [draft]);
        assert.deepEqual(classes[0].TournamentDraws, []);
        assert.equal(classes[0].ShowDraws, false);
        const row = publicRankedinResultsCache(tournamentId, {
            classes: [draft], has_draw: true, has_results: true,
            winners: [{ name: 'Bye winner' }], upcoming_matches: [{ TournamentClassName: 'Elite' }],
        });
        assert.equal(row.has_draw, false);
        assert.equal(row.has_results, false);
        assert.deepEqual(row.winners, []);
        assert.deepEqual(row.upcoming_matches, []);
        assert.deepEqual(publicRankedinMatches(tournamentId, {
            AreMatchesPublished: true, Matches: [{ TournamentClassName: 'Elite' }],
        }, [draft]), []);
    });

    test(`${tournamentId}: each explicitly published division becomes visible independently`, () => {
        const classes = publicRankedinClasses(tournamentId, [draft, published]);
        assert.deepEqual(classes[0].TournamentDraws, []);
        assert.deepEqual(classes[1], published);
        const visible = { TournamentClassName: 'Ladies' };
        const matches = [{ TournamentClassName: 'Elite' }, visible];
        assert.deepEqual(publicRankedinMatches(tournamentId, { AreMatchesPublished: true, Matches: matches }, classes), [visible]);
        assert.deepEqual(publicRankedinMatches(tournamentId, { AreMatchesPublished: false, Matches: matches }, classes), []);
        const row = publicRankedinResultsCache(tournamentId, { classes: [draft, published], has_draw: false, upcoming_matches: matches });
        assert.equal(row.has_draw, true);
        assert.deepEqual(row.upcoming_matches, [visible]);
    });
}

test('missing or non-boolean publication flags cannot release Johannesburg draws', () => {
    for (const IsPublished of [undefined, null, 0, 1, 'true', 'false']) {
        const classes = publicRankedinClasses('75763', [{ ...draft, IsPublished }]);
        assert.deepEqual(classes[0].TournamentDraws, []);
        assert.equal(classes[0].ShowDraws, false);
    }
    assert.equal(publicRankedinResultsCache('75763', { has_draw: true }).has_draw, false);
});

const hookSource = fs.readFileSync(new URL('../src/hooks/useRankedin.js', import.meta.url), 'utf8');
const matchHookSource = hookSource.slice(hookSource.indexOf('const getTournamentMatches ='), hookSource.indexOf('\n    const getTournamentWinners ='));

function matchesHook(classes, fetchWithCache) {
    const context = {
        useCallback: callback => callback, setLoading() {}, setError() {},
        getTournamentClasses: async () => publicRankedinClasses('75763', classes),
        fetchWithCache, requiresRankedinPublication, publicRankedinMatches,
        API_BASE: 'https://api.rankedin.test/v1', console,
    };
    vm.createContext(context);
    vm.runInContext(matchHookSource + '\nthis.getMatches = getTournamentMatches;', context);
    return context.getMatches;
}

test('unpublished Johannesburg classes do not request or cache match data', async () => {
    const getMatches = matchesHook([draft], async () => assert.fail('Draft match data must not be requested'));
    assert.deepEqual(Array.from(await getMatches({ tournamentId: '75763' })), []);
});

test('Johannesburg matches are loaded only for published divisions and published fixtures', async () => {
    const visible = { TournamentClassName: 'Ladies' };
    const requests = [];
    const getMatches = matchesHook([draft, published], async url => {
        requests.push(url);
        return { AreMatchesPublished: true, Matches: [{ TournamentClassName: 'Elite' }, visible] };
    });
    assert.deepEqual(await getMatches({ tournamentId: '75763', isFinished: false }), [visible]);
    assert.equal(requests.length, 1);
    assert.match(requests[0], /Id=75763.*isFinished=false/);
});
