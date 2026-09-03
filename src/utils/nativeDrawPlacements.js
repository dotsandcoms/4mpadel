const resolvedStatuses = new Set(['completed', 'walkover', 'retired']);

const roundDetails = (roundsFromFinal, tierCode) => {
    if (roundsFromFinal === 0) return { roundCode: 'winner', placement: '1st' };
    if (roundsFromFinal === 1) return { roundCode: 'finalist', placement: '2nd' };
    if (roundsFromFinal === 2) return { roundCode: 'semifinal', placement: '3rd–4th' };
    if (roundsFromFinal === 3) {
        return { roundCode: tierCode === 'major' ? 'quarterfinal_5_8' : 'quarterfinal', placement: '5th–8th' };
    }
    if (roundsFromFinal === 4) {
        if (tierCode === 'major') {
            return {
                roundCode: null,
                placement: '9th–16th',
                requiresManualPlacement: true,
                note: 'Major R16 points depend on the exact placement playoff result.',
            };
        }
        return { roundCode: 'r16', placement: 'R16' };
    }
    if (roundsFromFinal === 5) return { roundCode: 'r32', placement: 'R32' };
    return {
        roundCode: null,
        placement: 'Placement not configured',
        requiresManualPlacement: true,
        note: 'This bracket round does not have a configured ranking-points outcome.',
    };
};

/**
 * Converts a completed knockout draw into review-only finishing proposals.
 * It intentionally does not award or change any player points.
 */
export const deriveKnockoutPlacementProposals = ({ entries = [], matches = [], tierCode = null }) => {
    const knockoutMatches = matches.filter((match) => match.stage === 'knockout');
    const finalRound = Math.max(0, ...knockoutMatches.map((match) => Number(match.round_number) || 0));
    if (!finalRound) return [];

    const proposalByEntryId = new Map();
    const addProposal = (entryId, details) => {
        if (!entryId || proposalByEntryId.has(entryId)) return;
        proposalByEntryId.set(entryId, { entry_id: entryId, ...details });
    };

    knockoutMatches.forEach((match) => {
        if (!resolvedStatuses.has(match.status)) return;
        const roundsFromFinal = finalRound - (Number(match.round_number) || 0);
        const winnerId = match.winner_entry_id || match.winner?.id || null;
        const loserId = match.loser_entry_id || null;

        if (roundsFromFinal === 0) addProposal(winnerId, roundDetails(0, tierCode));
        if (loserId) addProposal(loserId, roundDetails(roundsFromFinal + 1, tierCode));
    });

    // A Top 4 playoff resolves the otherwise shared semifinal placement. It
    // keeps the semifinal points code unless a tournament points table chooses
    // to distinguish third and fourth later.
    matches.filter((match) => match.stage === 'placement' && match.round_code === '3_4' && resolvedStatuses.has(match.status))
        .forEach((match) => {
            const winnerId = match.winner_entry_id || match.winner?.id || null;
            const loserId = match.loser_entry_id || null;
            if (winnerId) proposalByEntryId.set(winnerId, { entry_id: winnerId, roundCode: 'semifinal', placement: '3rd' });
            if (loserId) proposalByEntryId.set(loserId, { entry_id: loserId, roundCode: 'semifinal', placement: '4th' });
        });

    return entries
        .filter((entry) => proposalByEntryId.has(entry.id))
        .map((entry) => ({ ...proposalByEntryId.get(entry.id), entry }))
        .sort((a, b) => {
            const order = (item) => ({ '1st': 1, '2nd': 2, '3rd': 3, '4th': 4, '3rd–4th': 3, '5th–8th': 5, R16: 6, R32: 7, '9th–16th': 8 }[item.placement] || 99);
            return order(a) - order(b) || String(a.entry?.team_name || '').localeCompare(String(b.entry?.team_name || ''));
        });
};
