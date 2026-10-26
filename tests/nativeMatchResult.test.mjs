import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareMatchResult, matchScoreText, pricePlacement } from '../src/utils/matchResult.js';
import { generateKnockoutDraft } from '../src/utils/nativeDrawGenerator.js';
import { resolveDrawRoutes, routeIds } from '../src/utils/drawBackplates.js';
import { deriveKnockoutPlacementProposals } from '../src/utils/nativeDrawPlacements.js';

const set = (a, b, tiebreak = null, duration = '') => ({ games: [a, b], tiebreak, duration });
test('game scores choose the second team automatically and preserve bracket order', () => {
    const result = prepareMatchResult({ sets: [set(6, 3), set(3, 6), set(4, 6)] });
    assert.equal(result.winner, 2);
    assert.deepEqual(result.summary, [1, 2]);
    assert.deepEqual(result.sets[0].games, [6, 3]);
});
test('summary-only results do not manufacture game scores', () => {
    assert.deepEqual(prepareMatchResult({ detailed: false, totals: ['2', '1'] }), { kind: 'played', winner: 1, summary: [2, 1], sets: [] });
    assert.throws(() => prepareMatchResult({ detailed: false, totals: ['1', '1'] }), /win 2 sets/);
    assert.throws(() => prepareMatchResult({ detailed: false, totals: ['', ''] }), /overall set score/);
});
test('live scores allow an unfinished last set and never select a winner', () => {
    const live = prepareMatchResult({ kind: 'live', sets: [set(6, 1), set(3, 2)] });
    assert.equal(live.winner, null);
    assert.deepEqual(live.summary, [1, 0]);
    assert.throws(() => prepareMatchResult({ sets: [set(6, 1), set(3, 2)] }), /finished set/);
    assert.throws(() => prepareMatchResult({ kind: 'live', sets: [set(6, 1), set(6, 2)] }), /final result/);
    assert.throws(() => prepareMatchResult({ kind: 'live', sets: [set(7, 7)] }), /finished set/);
    assert.deepEqual(prepareMatchResult({ kind: 'live', sets: [set(6, 6)] }).summary, [0, 0]);
});
test('rejects half sets, negative scores, invalid finished sets and extra sets', () => {
    for (const sets of [[set(6, '')], [set(-1, 0)], [set(6, 5), set(6, 2)], [set(6, 1), set(6, 2), set(6, 3)]]) assert.throws(() => prepareMatchResult({ sets }));
});
test('tiebreak points and duration survive and must agree with the set winner', () => {
    const result = prepareMatchResult({ sets: [set(7, 6, [9, 7], 65), set(6, 4)] });
    assert.deepEqual(result.sets[0].tiebreak, [9, 7]);
    assert.equal(result.sets[0].duration, 65);
    assert.throws(() => prepareMatchResult({ sets: [set(7, 6, [5, 7]), set(6, 4)] }), /tiebreak/);
    assert.throws(() => prepareMatchResult({ sets: [set(7, 6, [8, 5]), set(6, 4)] }), /tiebreak/);
});
test('retirement needs a winner but accepts no detailed scores', () => {
    assert.deepEqual(prepareMatchResult({ kind: 'retirement', winner: 2 }), { kind: 'retirement', winner: 2, summary: null, sets: [] });
    assert.throws(() => prepareMatchResult({ kind: 'retirement' }), /winning team/);
    assert.deepEqual(prepareMatchResult({ kind: 'walkover', winner: 1 }).sets, []);
});
test('set display includes summary-only and retirement scores', () => {
    assert.equal(matchScoreText({ id: 'm', result_summary: [1, 2] }), '1–2 sets');
    assert.equal(matchScoreText({ id: 'm', result_type: 'retirement' }), 'Retirement');
});
test('exact event finishing points override shared round bands, including zero', () => {
    const schedule = { placements: { '3rd': 1248, '5th': 819, '13th': 0 }, source_url: 'https://www.rankedin.com/en/tournament/75153/results' };
    for (const [placement, points] of Object.entries(schedule.placements)) {
        const priced = pricePlacement({ placement, roundCode: 'semifinal' }, [{ id: 'band', round_code: 'semifinal', points: 936 }], schedule);
        assert.equal(priced.pointsRule.points, points);
        assert.equal(priced.pointsRule.id, null);
    }
    assert.equal(pricePlacement({ placement: '3rd', roundCode: 'semifinal' }, [{ round_code: 'semifinal', points: 936 }]).pointsRule.points, 936);
});
test('all 14 finishing positions derive from main, Silver and Bronze regardless of row order', () => {
    const entries = Array.from({ length: 14 }, (_, i) => ({ id: `e${i}`, team_name: `Team ${i}`, seed_number: i + 1 }));
    const draw = generateKnockoutDraft(entries, { plateMode: 'triple', placementPlayoff: 'top8' });
    const routes = routeIds(draw.matches, m => m.key);
    let matches = resolveDrawRoutes(draw.matches.map(m => ({ ...m, id: m.key, entry_one_id: m.entry_one?.id || null, entry_two_id: m.entry_two?.id || null, winner_entry_id: m.winner?.id || null, ...routes.get(m.key) })));
    for (let i = 0; i < matches.length; i++) {
        const m = matches.find(m => m.status === 'pending' && m.entry_one_id && m.entry_two_id);
        if (!m) break;
        Object.assign(m, { status: 'completed', winner_entry_id: m.entry_one_id, loser_entry_id: m.entry_two_id });
        matches = resolveDrawRoutes(matches);
    }
    const proposals = deriveKnockoutPlacementProposals({ entries, matches, tierCode: 'major' });
    const reversed = deriveKnockoutPlacementProposals({ entries, matches: [...matches].reverse(), tierCode: 'major' });
    assert.deepEqual(proposals, reversed);
    assert.deepEqual(proposals.map(p => p.placement), ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th–12th', '11th–12th', '13th', '14th']);
    assert.equal(proposals[8].roundCode, 'r16_9');
    assert.equal(proposals[10].roundCode, 'r16_11_12');
    assert.equal(proposals[13].roundCode, 'r16_13_16');
});
