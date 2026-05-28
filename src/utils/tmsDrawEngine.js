/**
 * 4M Padel TMS - Draw Generation & Seeding Engine
 * Date: 2026-05-26
 * 
 * This engine provides standard tournament bracket algorithms:
 * 1. Single Elimination (with Byes and optional Plate brackets)
 * 2. Group Stage Round-Robin (with balanced seed distribution)
 * 3. Group Standings auto-calculator (sorting: wins > set difference > game difference)
 */

/**
 * Standard tournament placement indices for seed distribution in power-of-two brackets.
 * E.g., for a 16-draw: Seed 1 goes to index 0, Seed 2 to index 15, Seed 3 to index 8, etc.
 */
const SEED_PLACEMENTS = {
    2: [1, 2],
    4: [1, 4, 3, 2],
    8: [1, 8, 5, 4, 3, 6, 7, 2],
    16: [1, 16, 9, 8, 5, 12, 13, 4, 3, 14, 11, 6, 7, 10, 15, 2],
    32: [
        1, 32, 17, 16, 9, 24, 25, 8, 5, 28, 21, 12, 13, 20, 29, 4,
        3, 30, 19, 14, 11, 22, 27, 6, 7, 26, 23, 10, 15, 18, 31, 2
    ]
};

/**
 * Expands a team list to the nearest power of two, pre-filling empty spots as 'BYE'.
 * Returns the exact bracket size (e.g. 8, 16, 32) and the padded list of teams.
 */
export function expandToPowerOfTwo(teams) {
    const count = teams.length;
    let size = 2;
    while (size < count) {
        size *= 2;
    }
    
    // Sort teams by seed index first
    const sortedTeams = [...teams].sort((a, b) => (a.seed || 99) - (b.seed || 99));
    
    const padded = new Array(size).fill(null);
    const placementOrder = SEED_PLACEMENTS[size] || Array.from({ length: size }, (_, i) => i + 1);

    // Place seeded teams in their designated power-of-two slots
    sortedTeams.forEach((team, idx) => {
        const seedValue = idx + 1;
        const targetSlot = placementOrder.indexOf(seedValue);
        if (targetSlot !== -1) {
            padded[targetSlot] = team;
        } else {
            // Fallback: place in next open slot
            const openIdx = padded.indexOf(null);
            if (openIdx !== -1) padded[openIdx] = team;
        }
    });

    return { bracketSize: size, matchesList: padded };
}

/**
 * 1. Generates a Single Elimination Knockout Draw.
 * Returns an array of match objects representing Round 1, ready to be enqueued/written.
 */
export function generateKnockoutDraw(teams, divisionId) {
    const { bracketSize, matchesList } = expandToPowerOfTwo(teams);
    const roundMatches = [];

    // Round 1 has exactly bracketSize / 2 matches
    const matchCount = bracketSize / 2;
    for (let i = 0; i < matchCount; i++) {
        const team1 = matchesList[i * 2];
        const team2 = matchesList[i * 2 + 1];

        // A BYE match is when exactly one team is present and the other is empty
        const isByeMatch = (team1 && !team2) || (!team1 && team2);
        const winner = isByeMatch ? (team1 || team2) : null;

        roundMatches.push({
            division_id: divisionId,
            round_name: `Round of ${bracketSize}`,
            match_index: i,
            team_1_reg_id: team1 ? team1.id : null,
            team_2_reg_id: team2 ? team2.id : null,
            score: isByeMatch ? 'BYE' : null,
            winner_reg_id: winner ? winner.id : null,
            status: isByeMatch ? 'completed' : 'scheduled',
            court_name: null,
            scheduled_time: null
        });
    }

    return { bracketSize, roundMatches };
}

/**
 * Generates ALL matches for ALL rounds of a single elimination bracket.
 * Pre-populates Round 1 with teams, auto-resolves BYEs, and propagates winners to Round 2.
 */
export function generateAllKnockoutRounds(teams, divisionId, drawId) {
    const { bracketSize, matchesList } = expandToPowerOfTwo(teams);
    const roundsCount = Math.log2(bracketSize);
    
    // We will keep rounds as an array of arrays of matches
    const rounds = [];
    
    // 1. Initialize all rounds with empty/placeholder matches
    for (let r = 0; r < roundsCount; r++) {
        const roundSize = bracketSize / Math.pow(2, r);
        const matchCount = roundSize / 2;
        const roundMatches = [];
        
        let roundName = `Round of ${roundSize}`;
        if (matchCount === 1) roundName = 'Final';
        else if (matchCount === 2) roundName = 'SF';
        else if (matchCount === 4) roundName = 'QF';
        
        for (let i = 0; i < matchCount; i++) {
            roundMatches.push({
                division_id: divisionId,
                draw_id: drawId,
                round_name: roundName,
                match_index: i,
                team_1_reg_id: null,
                team_2_reg_id: null,
                score: null,
                winner_reg_id: null,
                status: 'scheduled',
                court_name: null,
                scheduled_time: null
            });
        }
        rounds.push(roundMatches);
    }
    
    // 2. Populate Round 1 matches with teams
    const round1 = rounds[0];
    for (let i = 0; i < round1.length; i++) {
        const t1 = matchesList[i * 2];
        const t2 = matchesList[i * 2 + 1];
        
        round1[i].team_1_reg_id = t1 ? t1.id : null;
        round1[i].team_2_reg_id = t2 ? t2.id : null;
        
        // Handle BYEs: Only mark as completed if exactly one team has a BYE
        if ((t1 && !t2) || (!t1 && t2)) {
            const winner = t1 || t2;
            round1[i].score = 'BYE';
            round1[i].winner_reg_id = winner ? winner.id : null;
            round1[i].status = 'completed';
        }
    }
    
    // 3. Propagate winners forward through all rounds
    for (let r = 0; r < roundsCount - 1; r++) {
        const currentRound = rounds[r];
        const nextRound = rounds[r + 1];
        
        for (let i = 0; i < currentRound.length; i++) {
            const match = currentRound[i];
            if (match.status === 'completed' && match.winner_reg_id) {
                const nextMatchIdx = Math.floor(i / 2);
                const isEven = i % 2 === 0;
                
                if (isEven) {
                    nextRound[nextMatchIdx].team_1_reg_id = match.winner_reg_id;
                } else {
                    nextRound[nextMatchIdx].team_2_reg_id = match.winner_reg_id;
                }
            }
        }
    }
    
    // Flatten and return all matches
    return rounds.flat();
}

/**
 * Generates placeholder matches for the Plate bracket.
 * Plate bracket size is half of the main bracket size (representing Round 1 losers).
 */
export function generateAllPlateRounds(mainBracketSize, divisionId, drawId) {
    const plateSize = mainBracketSize / 2;
    if (plateSize < 2) return []; // Too small for plate
    
    const roundsCount = Math.log2(plateSize);
    const rounds = [];
    
    for (let r = 0; r < roundsCount; r++) {
        const roundSize = plateSize / Math.pow(2, r);
        const matchCount = roundSize / 2;
        const roundMatches = [];
        
        let roundName = `Plate Round of ${roundSize}`;
        if (matchCount === 1) roundName = 'Plate Final';
        else if (matchCount === 2) roundName = 'Plate SF';
        else if (matchCount === 4) roundName = 'Plate QF';
        
        for (let i = 0; i < matchCount; i++) {
            roundMatches.push({
                division_id: divisionId,
                draw_id: drawId,
                round_name: roundName,
                match_index: i,
                team_1_reg_id: null,
                team_2_reg_id: null,
                score: null,
                winner_reg_id: null,
                status: 'scheduled',
                court_name: null,
                scheduled_time: null
            });
        }
        rounds.push(roundMatches);
    }
    
    return rounds.flat();
}


/**
 * 2. Generates a Group Stage (Round Robin) Draw.
 * Distributes teams evenly into N groups and generates all group play matches.
 */
export function generateGroupDraw(teams, divisionId, groupCount) {
    // Sort by seed to distribute snake-style across groups
    const sorted = [...teams].sort((a, b) => (a.seed || 99) - (b.seed || 99));
    
    // Snaking distribution: Group A, B, C, D, then D, C, B, A...
    const groups = Array.from({ length: groupCount }, (_, i) => ({
        name: `Group ${String.fromCharCode(65 + i)}`,
        teams: []
    }));

    let forward = true;
    let groupIdx = 0;
    sorted.forEach((team) => {
        groups[groupIdx].teams.push(team);
        if (forward) {
            if (groupIdx === groupCount - 1) {
                forward = false;
            } else {
                groupIdx++;
            }
        } else {
            if (groupIdx === 0) {
                forward = true;
            } else {
                groupIdx--;
            }
        }
    });

    // Generate matches for each group
    const allMatches = [];
    groups.forEach((group) => {
        const gTeams = group.teams;
        const tCount = gTeams.length;

        // Generate round robin pairs
        let matchIdx = 0;
        for (let i = 0; i < tCount; i++) {
            for (let j = i + 1; j < tCount; j++) {
                allMatches.push({
                    division_id: divisionId,
                    round_name: group.name,
                    match_index: matchIdx++,
                    team_1_reg_id: gTeams[i].id,
                    team_2_reg_id: gTeams[j].id,
                    score: null,
                    winner_reg_id: null,
                    status: 'scheduled',
                    court_name: null,
                    scheduled_time: null
                });
            }
        }
    });

    return { groups, allMatches };
}

/**
 * 3. Calculates Group Standings based on completed match scores.
 * Enforces standard Padel standing rules:
 * - Match Wins (2 points per win, 1 per loss/play, 0 per walkover)
 * - Head-to-Head (if 2 teams tied)
 * - Set Difference
 * - Game Difference
 */
export function calculateGroupStandings(groupMatches, groupTeams) {
    const standings = groupTeams.map(team => ({
        id: team.id,
        name: team.full_name,
        partnerName: team.partner_name,
        played: 0,
        wins: 0,
        losses: 0,
        setsWon: 0,
        setsLost: 0,
        gamesWon: 0,
        gamesLost: 0,
        points: 0
    }));

    groupMatches.forEach(match => {
        if (match.status !== 'completed' && match.status !== 'walkover') return;

        const t1 = standings.find(s => s.id === match.team_1_reg_id);
        const t2 = standings.find(s => s.id === match.team_2_reg_id);
        if (!t1 || !t2) return;

        t1.played++;
        t2.played++;

        // Walkover handler
        if (match.status === 'walkover') {
            if (match.winner_reg_id === t1.id) {
                t1.wins++;
                t1.points += 2;
                t2.losses++;
            } else {
                t2.wins++;
                t2.points += 2;
                t1.losses++;
            }
            return;
        }

        // Standard score parsing (e.g. "6-4, 3-6, 10-8" or "6-2, 6-3")
        const sets = (match.score || '').split(',');
        let t1Sets = 0;
        let t2Sets = 0;

        sets.forEach(set => {
            const games = set.trim().split('-');
            if (games.length !== 2) return;
            const g1 = parseInt(games[0], 10) || 0;
            const g2 = parseInt(games[1], 10) || 0;

            t1.gamesWon += g1;
            t1.gamesLost += g2;
            t2.gamesWon += g2;
            t2.gamesLost += g1;

            if (g1 > g2) {
                t1Sets++;
            } else {
                t2Sets++;
            }
        });

        t1.setsWon += t1Sets;
        t1.setsLost += t2Sets;
        t2.setsWon += t2Sets;
        t2.setsLost += t1Sets;

        if (match.winner_reg_id === t1.id) {
            t1.wins++;
            t1.points += 2;
            t2.losses++;
            t2.points += 1; // Play point
        } else {
            t2.wins++;
            t2.points += 2;
            t1.losses++;
            t1.points += 1;
        }
    });

    // Sort standings based on priority sorting:
    // 1. Points
    // 2. Set difference
    // 3. Game difference
    return standings.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        const aSetDiff = a.setsWon - a.setsLost;
        const bSetDiff = b.setsWon - b.setsLost;
        if (bSetDiff !== aSetDiff) return bSetDiff - aSetDiff;
        const aGameDiff = a.gamesWon - a.gamesLost;
        const bGameDiff = b.gamesWon - b.gamesLost;
        return bGameDiff - aGameDiff;
    });
}
