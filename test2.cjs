const fs = require('fs');
const data = JSON.parse(fs.readFileSync('test_draw.json'));
let elim = data.find(d => d.BaseType === 'Elimination').Elimination.DrawData;
elim.forEach((row) => {
    row.forEach((cell) => {
        if (!cell || (!cell.MatchCell && !cell.MatchViewModel)) return;
        const m = cell.MatchCell || cell;
        if (m.Round === 2 && m.MatchOrder === 1) {
            console.log('R2 M1 Score:', JSON.stringify(m.MatchViewModel.Score));
        }
    });
});
