const fs = require('fs');
const data = JSON.parse(fs.readFileSync('test_draw.json'));
let elim = data.find(d => d.BaseType === 'Elimination').Elimination.DrawData;
const roundsMap = {};
elim.forEach((row, i) => {
    row.forEach((cell, j) => {
        if (!cell || (!cell.MatchCell && !cell.MatchViewModel)) return;
        const m = cell.MatchCell || cell;
        const round = m.Round;
        if (typeof round === 'undefined') return;
        if (!roundsMap[round]) roundsMap[round] = [];
        const matchId = m.MatchId;
        // The issue is my dedup logic checks ONLY if cell.MatchId is present.
        // Wait, m.MatchId! BUT `existing` might be just `cell`!
        if (!roundsMap[round].some(existing => {
            const extm = existing.MatchCell || existing;
            return extm.MatchId === matchId;
        })) {
            roundsMap[round].push(cell);
        }
    });
});

const sortedRounds = Object.keys(roundsMap).map(Number).sort((a, b) => a - b).map(roundKey => {
    return roundsMap[roundKey].sort((a, b) => {
        const ordA = (a.MatchCell || a).MatchOrder || 0;
        const ordB = (b.MatchCell || b).MatchOrder || 0;
        return ordA - ordB;
    });
});

sortedRounds.forEach((r, idx) => {
    console.log('Round ' + (idx + 1));
    r.forEach(cell => {
        let p1 = cell.ChallengerParticipant;
        let p2 = cell.ChallengedParticipant;
        console.log('  Match:', p1 ? p1.FirstPlayer?.Name : 'null', 'vs', p2 ? p2.FirstPlayer?.Name : 'null');
    });
});
