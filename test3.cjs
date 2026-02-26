const fs = require('fs');
const data = JSON.parse(fs.readFileSync('test_draw.json'));
let elim = data.find(d => d.BaseType === 'Elimination').Elimination.DrawData;
elim.forEach((row, rowIndex) => {
    row.forEach((cell) => {
        if (!cell || (!cell.MatchCell && !cell.MatchViewModel)) return;
        const m = cell.MatchCell || cell;
        if (m.Round === 2 && m.MatchOrder === 1) {
            console.log(`Path ${rowIndex} Round 2 Match ${m.MatchOrder} (${m.MatchId}):`);
            console.log(' P1:', cell.ChallengerParticipant ? cell.ChallengerParticipant.FirstPlayer?.Name : 'null');
            console.log(' P2:', cell.ChallengedParticipant ? cell.ChallengedParticipant.FirstPlayer?.Name : 'null');
        }
    });
});
