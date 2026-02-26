const fs = require('fs');
const data = JSON.parse(fs.readFileSync('test_draw.json'));
let elim = data.find(d => d.BaseType === 'Elimination').Elimination.DrawData;
const r2 = {};
elim.forEach((row, i) => {
    row.forEach((cell, j) => {
        if (!cell || (!cell.MatchCell && !cell.MatchViewModel)) return;
        const m = cell.MatchCell || cell;
        if(m.Round === 2) {
            let p1 = cell.ChallengerParticipant ? cell.ChallengerParticipant.FirstPlayer?.Name : 'null';
            let p2 = cell.ChallengedParticipant ? cell.ChallengedParticipant.FirstPlayer?.Name : 'null';
            r2[m.MatchId] = p1 + ' vs ' + p2;
        }
    });
});
console.log(r2);
