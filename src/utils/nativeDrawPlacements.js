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
    if (roundsFromFinal === 5) return { roundCode: tierCode === 'major' ? 'r32_17' : 'r32', placement: 'R32' };
    return {
        roundCode: null,
        placement: 'Placement not configured',
        requiresManualPlacement: true,
        note: 'This bracket round does not have a configured ranking-points outcome.',
    };
};

const ordinal = place => {
    const suffix = place % 100 >= 11 && place % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[place % 10] || 'th');
    return `${place}${suffix}`;
};

function placementDetails(low, high, tierCode) {
    const placement = low === high ? ordinal(low) : `${ordinal(low)}–${ordinal(high)}`;
    let roundCode = null;
    if (low === high && low === 1) roundCode = 'winner';
    else if (low === high && low === 2) roundCode = 'finalist';
    else if (low >= 3 && high <= 4) roundCode = 'semifinal';
    else if (low >= 5 && high <= 8) roundCode = tierCode === 'major' ? 'quarterfinal_5_8' : 'quarterfinal';
    else if (low >= 9 && high <= 16) {
        if (tierCode !== 'major') roundCode = 'r16';
        else if (low === 9 && high === 9) roundCode = 'r16_9';
        else if (low === 10 && high === 10) roundCode = 'r16_10';
        else if (low >= 11 && high <= 12) roundCode = 'r16_11_12';
        else if (low >= 13) roundCode = 'r16_13_16';
    } else if (low >= 17 && high <= 32) roundCode = tierCode === 'major' ? 'r32_17' : 'r32';
    return { placement, roundCode, ...(!roundCode ? { requiresManualPlacement: true, note: 'The recorded placement does not identify a configured points band. Review the official placement.' } : {}) };
}

/**
 * Converts a completed knockout draw into review-only finishing proposals.
 * It intentionally does not award or change any player points.
 */
export const deriveKnockoutPlacementProposals = ({ entries = [], matches = [], tierCode = null }) => {
    const knockoutMatches = matches.filter((match) => match.stage === 'knockout');
    const finalRound = Math.max(0, ...knockoutMatches.map((match) => Number(match.round_number) || 0));
    if (!finalRound) return [];

    const proposalByEntryId = new Map();
    const precision = new Map();
    const addProposal = (entryId, details, span) => {
        if (!entryId || (precision.has(entryId) && precision.get(entryId) <= span)) return;
        proposalByEntryId.set(entryId, { entry_id: entryId, ...details });
        precision.set(entryId, span);
    };

    knockoutMatches.forEach((match) => {
        if (!resolvedStatuses.has(match.status)) return;
        const roundsFromFinal = finalRound - (Number(match.round_number) || 0);
        const winnerId = match.winner_entry_id || match.winner?.id || null;
        const loserId = match.loser_entry_id || null;

        if (roundsFromFinal === 0) addProposal(winnerId, roundDetails(0, tierCode), 0);
        if (loserId) addProposal(loserId, roundDetails(roundsFromFinal + 1, tierCode), 2 ** roundsFromFinal - 1);
    });

    // A placement playoff resolves the otherwise shared semifinal placement. It
    // keeps the semifinal points code unless a tournament points table chooses
    // to distinguish third and fourth later.
    matches.filter((match) => match.stage === 'placement' && match.round_code === '3_4' && resolvedStatuses.has(match.status))
        .forEach((match) => {
            const winnerId = match.winner_entry_id || match.winner?.id || null;
            const loserId = match.loser_entry_id || null;
            addProposal(winnerId, { roundCode: 'semifinal', placement: '3rd' }, 0);
            addProposal(loserId, { roundCode: 'semifinal', placement: '4th' }, 0);
        });

    // Follow every placement range, including Silver and Bronze. Losing in the
    // 9–16 semifinals establishes 11–12; its final establishes 9 and 10. A later
    // finishing match can narrow a band, but never replace an exact placement
    // with a wider band if rows are loaded in a different order.
    matches.filter(match => match.stage === 'placement' && resolvedStatuses.has(match.status))
        .forEach(match => {
            const range = /^places_(\d+)_(\d+)_r(\d+)$/.exec(match.round_code || '');
            if (!range) return;
            const [, lowValue, highValue, roundValue] = range;
            const low = Number(lowValue), high = Number(highValue), round = Number(roundValue);
            const width = high - low + 1, finalRound = Math.log2(width);
            if (!Number.isInteger(finalRound) || round < 1 || round > finalRound) return;
            const winnerId = match.winner_entry_id || match.winner?.id || null;
            const loserId = match.loser_entry_id || null;
            if (round === finalRound) addProposal(winnerId, placementDetails(low, low, tierCode), 0);
            const loserLow = low + width / 2 ** round;
            const loserHigh = low + width / 2 ** (round - 1) - 1;
            addProposal(loserId, placementDetails(loserLow, loserHigh, tierCode), loserHigh - loserLow);
        });

    return entries
        .filter((entry) => proposalByEntryId.has(entry.id))
        .map((entry) => ({ ...proposalByEntryId.get(entry.id), entry }))
        .sort((a, b) => {
            const order = item => Number(/\d+/.exec(item.placement)?.[0]) || 99;
            return order(a) - order(b) || String(a.entry?.team_name || '').localeCompare(String(b.entry?.team_name || ''));
        });
};
