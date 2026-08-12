import fs from 'fs';

const data = JSON.parse(fs.readFileSync('./test_draw.json', 'utf-8'));

data.forEach((bracket, i) => {
    if (bracket.BaseType === 'Elimination' && bracket.Elimination) {
        let drawData = bracket.Elimination.DrawData;
        console.log(`\nBracket ${i + 1}:`);
        
        const matchesMap = {};
        
        drawData.forEach(row => {
            row.forEach(cell => {
                if (!cell || (!cell.MatchCell && !cell.MatchViewModel)) return;
                
                const round = cell.Round;
                if (!matchesMap[round]) matchesMap[round] = [];
                
                const matchId = cell.MatchId;
                if (!matchesMap[round].some(existing => existing.MatchId === matchId)) {
                    matchesMap[round].push(cell);
                }
            });
        });
        
        const rounds = Object.keys(matchesMap).map(Number).sort((a, b) => a - b);
        rounds.forEach(r => {
            const matchesOfRound = matchesMap[r].sort((a,b) => (a.MatchOrder || 0) - (b.MatchOrder || 0));
            console.log(`  Round ${r} (${matchesOfRound.length} matches):`);
            matchesOfRound.forEach(m => {
                const team1Name = m.ChallengerParticipant?.FirstPlayer?.Name;
                const team2Name = m.ChallengedParticipant?.FirstPlayer?.Name;
                console.log(`    Order ${m.MatchOrder}: ${team1Name} vs ${team2Name} (MatchId: ${m.MatchId})`);
            });
        });
    }
});
