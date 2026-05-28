/**
 * 4M Padel TMS - Local to RankedIn Data Adapter
 * Date: 2026-05-26
 * 
 * Maps local Supabase matches and divisions into the exact schema
 * and format expected by the React <KnockoutBracket> component.
 */

/**
 * Parses score string (e.g. "6-4, 3-6, 10-8") into structured set scores.
 */
export function parseScoreString(scoreStr, isFirstWinner) {
    if (!scoreStr || scoreStr === 'BYE') {
        return {
            FirstParticipantScore: null,
            SecondParticipantScore: null,
            DetailedScoring: []
        };
    }

    const sets = scoreStr.split(',');
    let t1SetsWon = 0;
    let t2SetsWon = 0;
    const detailed = [];

    sets.forEach(set => {
        const games = set.trim().split('-');
        if (games.length === 2) {
            const g1 = parseInt(games[0], 10) || 0;
            const g2 = parseInt(games[1], 10) || 0;
            detailed.push({
                FirstParticipantScore: g1,
                SecondParticipantScore: g2
            });
            if (g1 > g2) t1SetsWon++;
            else if (g2 > g1) t2SetsWon++;
        }
    });

    return {
        FirstParticipantScore: t1SetsWon,
        SecondParticipantScore: t2SetsWon,
        DetailedScoring: detailed,
        IsFirstParticipantWinner: isFirstWinner
    };
}

/**
 * Derives the round index (0-indexed) from the round name.
 */
export function getRoundIndexFromName(roundName, totalRounds) {
    const clean = (roundName || '').trim().toUpperCase();
    
    // Main Bracket End Rounds
    if (clean === 'FINAL') return totalRounds - 1;
    if (clean === 'SF' || clean === 'SEMI' || clean === 'SEMI FINAL' || clean === 'SEMI-FINAL') return totalRounds - 2;
    if (clean === 'QF' || clean === 'QUARTER' || clean === 'QUARTER FINAL' || clean === 'QUARTER-FINAL') return totalRounds - 3;

    // Plate Bracket End Rounds
    if (clean === 'PLATE FINAL') return totalRounds - 1;
    if (clean === 'PLATE SF' || clean === 'PLATE SEMI') return totalRounds - 2;
    if (clean === 'PLATE QF' || clean === 'PLATE QUARTER') return totalRounds - 3;

    // Main Bracket Rounds by Size
    const match = clean.match(/ROUND OF (\d+)/);
    if (match) {
        const size = parseInt(match[1], 10);
        const totalTeams = Math.pow(2, totalRounds);
        return Math.max(0, Math.log2(totalTeams) - Math.log2(size));
    }

    // Plate Bracket Rounds by Size
    const plateMatch = clean.match(/PLATE ROUND OF (\d+)/);
    if (plateMatch) {
        const size = parseInt(plateMatch[1], 10);
        const totalTeams = Math.pow(2, totalRounds);
        return Math.max(0, Math.log2(totalTeams) - Math.log2(size));
    }

    return 0; // Fallback
}

/**
 * Translates local database matches and registrations into RankedIn format.
 */
export function adaptLocalDrawToKnockoutBracket(dbMatches, drawName, drawType, totalRounds) {
    if (!dbMatches || !Array.isArray(dbMatches) || dbMatches.length === 0) {
        return [];
    }

    if (drawType === 'group_stage' || drawType === 'group') {
        // Group Stage Render Logic
        // In this case, EventDraws or TournamentDraw will compute the standings
        // and format them using tmsDrawEngine.calculateGroupStandings
        return []; 
    }

    // Elimination Draw Mapping
    const mappedMatches = dbMatches.map(match => {
        const t1 = match.team_1; // joined event_registrations row
        const t2 = match.team_2; // joined event_registrations row

        const challenger = t1 ? {
            Id: t1.id,
            Name: t1.full_name,
            FirstPlayer: { Name: t1.full_name, CountryShort: 'ZA' },
            SecondPlayer: t1.partner_name ? { Name: t1.partner_name, CountryShort: 'ZA' } : null
        } : null;

        const challenged = t2 ? {
            Id: t2.id,
            Name: t2.full_name,
            FirstPlayer: { Name: t2.full_name, CountryShort: 'ZA' },
            SecondPlayer: t2.partner_name ? { Name: t2.partner_name, CountryShort: 'ZA' } : null
        } : null;

        const isFirstWinner = match.winner_reg_id && t1 && match.winner_reg_id === t1.id;
        const scoreObj = parseScoreString(match.score, isFirstWinner);
        const hasScore = match.status === 'completed' || match.status === 'walkover' || match.status === 'retired';

        const roundIndex = getRoundIndexFromName(match.round_name, totalRounds);

        const cellData = {
            MatchId: match.id,
            Round: roundIndex,
            MatchOrder: match.match_index || 0,
            ChallengerParticipant: challenger,
            ChallengedParticipant: challenged,
            WinnerParticipantId: match.winner_reg_id,
            HasScore: hasScore,
            Score: scoreObj,
            Court: match.court_name || 'TBD',
            Date: match.scheduled_time || null
        };

        return {
            ...cellData,
            MatchCell: cellData,
            MatchViewModel: cellData
        };
    });

    // Wrap the mapped flat list inside a 2D array [ [ ...matches ] ]
    // so that KnockoutBracket.jsx can safely run .forEach on the outer array!
    return [{
        BaseType: 'Elimination',
        Elimination: {
            Name: drawName || 'Main Draw',
            DrawData: [ mappedMatches ]
        }
    }];
}
