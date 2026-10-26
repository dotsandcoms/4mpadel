// SA Nationals must follow RankedIn's explicit publication flag. ShowDraws
// also appears on draft draws and is not a release signal for this event.
export const requiresRankedinPublication = (tournamentId) => String(tournamentId) === '75314';

export function publicRankedinClasses(tournamentId, classes) {
    if (!Array.isArray(classes)) return [];
    if (!requiresRankedinPublication(tournamentId)) return classes;
    return classes.map((division) => division.IsPublished === true ? division : {
        ...division,
        ShowDraws: false,
        TournamentDraws: [],
    });
}

export function publicRankedinResultsCache(tournamentId, row) {
    if (!row || !requiresRankedinPublication(tournamentId)) return row;
    const classes = publicRankedinClasses(tournamentId, row.classes);
    const hasDraw = classes.some((division) => division.IsPublished === true && division.TournamentDraws?.length > 0);
    return {
        ...row,
        classes,
        has_draw: hasDraw,
        ...(!hasDraw ? { has_results: false, winners: [], upcoming_matches: [] } : {}),
    };
}

export function publicRankedinMatches(tournamentId, payload, classes) {
    const matches = payload?.Matches || [];
    if (!requiresRankedinPublication(tournamentId)) return matches;
    if (payload?.AreMatchesPublished !== true) return [];
    const publishedNames = new Set(publicRankedinClasses(tournamentId, classes)
        .filter((division) => division.IsPublished === true && division.TournamentDraws?.length > 0)
        .map((division) => division.Name));
    return matches.filter((match) => publishedNames.has(match.TournamentClassName));
}
