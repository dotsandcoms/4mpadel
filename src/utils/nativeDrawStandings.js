/**
 * Computes the persisted group-table values from completed native matches.
 * Ordering follows the agreed tournament convention: match points, head-to-head
 * (for two-way ties), set difference, game difference, games won, then seed.
 */
export const calculateGroupStandings = ({ entries = [], matches = [], matchSets = [], groupId }) => {
    const groupEntries = entries.filter((entry) => entry.group_id === groupId);
    const rows = new Map(groupEntries.map((entry) => [entry.id, {
        draw_id: entry.draw_id,
        group_id: groupId,
        entry_id: entry.id,
        played: 0,
        won: 0,
        lost: 0,
        sets_for: 0,
        sets_against: 0,
        games_for: 0,
        games_against: 0,
        standings_points: 0,
        position: null,
        requires_manual_resolution: false,
        seed_number: entry.seed_number || 9999,
    }]));
    const completed = matches.filter((match) => (
        match.group_id === groupId
        && ['completed', 'walkover', 'retired'].includes(match.status)
        && match.entry_one_id
        && match.entry_two_id
        && match.winner_entry_id
    ));
    const headToHead = new Map();
    completed.forEach((match) => {
        const one = rows.get(match.entry_one_id);
        const two = rows.get(match.entry_two_id);
        if (!one || !two) return;
        one.played += 1; two.played += 1;
        const winner = rows.get(match.winner_entry_id);
        const loser = rows.get(match.winner_entry_id === match.entry_one_id ? match.entry_two_id : match.entry_one_id);
        winner.won += 1; winner.standings_points += 2; loser.lost += 1;
        headToHead.set(`${match.entry_one_id}:${match.entry_two_id}`, match.winner_entry_id);
        headToHead.set(`${match.entry_two_id}:${match.entry_one_id}`, match.winner_entry_id);
        matchSets.filter((set) => set.match_id === match.id).forEach((set) => {
            const oneWon = set.entry_one_games > set.entry_two_games;
            const twoWon = set.entry_two_games > set.entry_one_games;
            one.games_for += set.entry_one_games; one.games_against += set.entry_two_games;
            two.games_for += set.entry_two_games; two.games_against += set.entry_one_games;
            if (oneWon) { one.sets_for += 1; two.sets_against += 1; }
            if (twoWon) { two.sets_for += 1; one.sets_against += 1; }
        });
    });
    const sorted = [...rows.values()].sort((a, b) => {
        if (b.standings_points !== a.standings_points) return b.standings_points - a.standings_points;
        const aVsB = headToHead.get(`${a.entry_id}:${b.entry_id}`);
        if (aVsB) return aVsB === a.entry_id ? -1 : 1;
        const aSetDiff = a.sets_for - a.sets_against;
        const bSetDiff = b.sets_for - b.sets_against;
        if (bSetDiff !== aSetDiff) return bSetDiff - aSetDiff;
        const aGameDiff = a.games_for - a.games_against;
        const bGameDiff = b.games_for - b.games_against;
        if (bGameDiff !== aGameDiff) return bGameDiff - aGameDiff;
        if (b.games_for !== a.games_for) return b.games_for - a.games_for;
        return a.seed_number - b.seed_number;
    });
    return sorted.map((row, index) => {
        const prior = sorted[index - 1];
        const tiedWithoutHeadToHead = prior
            && row.standings_points === prior.standings_points
            && row.sets_for - row.sets_against === prior.sets_for - prior.sets_against
            && row.games_for - row.games_against === prior.games_for - prior.games_against
            && row.games_for === prior.games_for
            && !headToHead.get(`${row.entry_id}:${prior.entry_id}`);
        return { ...row, position: index + 1, requires_manual_resolution: Boolean(tiedWithoutHeadToHead) };
    });
};

export const areGroupMatchesComplete = (matches = [], groupId) => {
    const groupMatches = matches.filter((match) => match.group_id === groupId);
    return groupMatches.length > 0 && groupMatches.every((match) => (
        ['completed', 'walkover', 'retired'].includes(match.status)
    ));
};
