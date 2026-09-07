import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRankedinMatchScore } from '../src/utils/rankedinMatchScore.js';

test('Pretoria Major aggregate result survives an empty set breakdown', () => {
    assert.deepEqual(normalizeRankedinMatchScore({ FirstParticipantScore: 2, SecondParticipantScore: 1, DetailedScoring: [] }), {
        Score: [{ Score1: 2, Score2: 1 }], IsSummary: true,
    });
});
test('individual sets take precedence over match totals', () => {
    assert.deepEqual(normalizeRankedinMatchScore({ FirstParticipantScore: 2, SecondParticipantScore: 0,
        DetailedScoring: [{ FirstParticipantScore: 6, SecondParticipantScore: 4 }, { FirstParticipantScore: 6, SecondParticipantScore: 0 }] }), {
        Score: [{ Score1: 6, Score2: 4 }, { Score1: 6, Score2: 0 }], IsSummary: false,
    });
});
test('unpublished and invalid scores do not become a manufactured result', () => {
    for (const score of [null, {}, { FirstParticipantScore: null, SecondParticipantScore: 0 }, { FirstParticipantScore: 'bad', SecondParticipantScore: 1 }]) {
        assert.deepEqual(normalizeRankedinMatchScore(score), { Score: [] });
    }
});
test('a published zero is retained', () => {
    assert.deepEqual(normalizeRankedinMatchScore({ FirstParticipantScore: '0', SecondParticipantScore: '2' }), {
        Score: [{ Score1: 0, Score2: 2 }], IsSummary: true,
    });
});
