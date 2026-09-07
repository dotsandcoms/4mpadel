/** Preserve published match totals when RankedIn does not provide individual sets. */
export function normalizeRankedinMatchScore(score) {
    const detailed = Array.isArray(score?.DetailedScoring) ? score.DetailedScoring : [];
    if (detailed.length) {
        return {
            Score: detailed.map(set => ({ Score1: set.FirstParticipantScore, Score2: set.SecondParticipantScore })),
            IsSummary: false,
        };
    }
    const first = score?.FirstParticipantScore;
    const second = score?.SecondParticipantScore;
    if (first != null && second != null && Number.isFinite(Number(first)) && Number.isFinite(Number(second))) {
        return { Score: [{ Score1: Number(first), Score2: Number(second) }], IsSummary: true };
    }
    return { Score: [] };
}
