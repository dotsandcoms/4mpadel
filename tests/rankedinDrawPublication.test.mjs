import test from 'node:test';
import assert from 'node:assert/strict';
import { publicRankedinClasses, publicRankedinMatches, publicRankedinResultsCache } from '../src/utils/rankedinDrawPublication.js';

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

test('other tournaments retain their existing draw and match behavior', () => {
    const classes = [draft];
    const row = { classes, has_draw: true };
    const matches = [{ TournamentClassName: 'Elite' }];
    assert.equal(publicRankedinClasses('12345', classes), classes);
    assert.equal(publicRankedinResultsCache('12345', row), row);
    assert.equal(publicRankedinMatches('12345', { Matches: matches }, classes), matches);
});
