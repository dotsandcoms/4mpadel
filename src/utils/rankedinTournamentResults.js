/** RankedIn's standings endpoint distinguishes published results from elapsed event dates. */
export const areRankedinResultsPublished = (standings) => standings?.IsFinished === true;

const participantName = (row) => {
    const names = [row?.Player1Name, row?.Player2Name]
        .filter((name) => typeof name === 'string' && name.trim())
        .map((name) => name.trim());
    return names.some((name) => /^(pending|tbd|bye)$/i.test(name)) ? '' : names.join(' & ');
};

/** Use official final standings rather than inferring champions from draw matches. */
export function rankedinWinnersFromStandings(standings, division, results) {
    if (!areRankedinResultsPublished(standings) || !Array.isArray(results?.Data)) return null;
    const rows = results.Data;
    const first = rows.filter((row) => Number(row.Standing) === 1
        && (!row.StandingRangeTo || Number(row.StandingRangeTo) === 1));
    if (first.length !== 1) return null;
    const winner = participantName(first[0]);
    if (!winner) return null;
    const runnerUp = participantName(rows.find((row) => Number(row.Standing) === 2));
    const semifinalists = rows.filter((row) => [3, 4].includes(Number(row.Standing)))
        .map(participantName).filter(Boolean);
    return {
        CategoryName: division.Name,
        className: division.Name,
        drawName: 'Final standings',
        Winner: { Name: winner },
        RunnerUp: runnerUp ? { Name: runnerUp } : null,
        ThirdPlace: semifinalists[0] ? { Name: semifinalists[0] } : null,
        FourthPlace: semifinalists[1] ? { Name: semifinalists[1] } : null,
        winners: winner,
        runnerUp: runnerUp || null,
        resultSource: 'rankedin-standings',
    };
}

export function hasVerifiedRankedinWinners(row) {
    return row?.has_results === true && Array.isArray(row.winners) && row.winners.length > 0
        && row.winners.every((winner) => winner.resultSource === 'rankedin-standings');
}
