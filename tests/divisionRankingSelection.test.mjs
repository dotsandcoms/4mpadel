import test from 'node:test';
import assert from 'node:assert/strict';
import { divisionRankingSource, resolvePlayerRanking } from '../src/utils/playerRankingSelection.js';
const mark = {
    points: 1729, preferred_ranking: 'SAPA|Men-Main|Doubles',
    rankings: [
        { org: 'SAPA', age_group: 'Men-Main', match_type: 'Men-Doubles', points: 1729 },
        { org: 'SAPA', age_group: 'Men Over 40', match_type: 'Men-Doubles', points: 1936 },
        { org: 'SA', age_group: 'Men Over 40', match_type: 'Men-Doubles', points: 9000 },
    ],
};
test('Mark contributes his SAPA 40+ points to the team, irrespective of active Main ranking', () => {
    const source = divisionRankingSource({ name: "Men’s 40+", seeding_ranking_source: 'active' });
    const partner = { rankings: [{ org: 'SAPA', age_group: 'Men Over 40', match_type: 'Doubles', points: 500 }] };
    assert.equal(resolvePlayerRanking(mark, source).points, 1936);
    assert.equal([mark, partner].reduce((sum, p) => sum + resolvePlayerRanking(p, source).points, 0), 2436);
    assert.equal(resolvePlayerRanking(mark, divisionRankingSource({ name: "Men's Open" })).points, 1729);
});
test('missing division rankings contribute zero, not profile or other organisation points', () => {
    const source = divisionRankingSource({ name: 'Mens 50+' });
    assert.equal(resolvePlayerRanking(mark, source).points, 0);
    assert.equal(resolvePlayerRanking(mark, source).missing, true);
    assert.equal(resolvePlayerRanking(null, source).points, 0);
});
test('normalises supported gender and age division labels', () => {
    for (const [name, category] of [
        ['Men Over 40', 'Men Over 40'], ['Mens 40+', 'Men Over 40'],
        ['Ladies 40+', 'Women Over 40'], ["Women’s Open", 'Women-Main'],
        ['Mixed Open', 'Mixed-Main'], ['Boys U14', 'Boys Under 14'],
        ['Girls Under 16', 'Girls Under 16'], ["Men's Advanced", 'Men-Main'],
    ]) assert.equal(divisionRankingSource({ name }), `category:SAPA|${category}|Doubles`);
});
test('preserves explicit ranking overrides and unknown division compatibility', () => {
    for (const source of ['organisation:BROLL', 'category:SA|Men Over 40|Doubles', 'rankedin_class']) {
        assert.equal(divisionRankingSource({ name: 'Mens 40+', seeding_ranking_source: source }), source);
    }
    assert.equal(divisionRankingSource({ name: 'Social A' }), 'active');
    assert.equal(resolvePlayerRanking(mark).points, 1729);
});
test('doubles seeding excludes singles records', () => {
    const source = divisionRankingSource({ name: 'Mens 40+' });
    const player = { rankings: [{ org: 'SAPA', age_group: 'Men Over 40', match_type: 'Men-Singles', points: 9999 }, ...mark.rankings] };
    assert.equal(resolvePlayerRanking(player, source).points, 1936);
});

test('automatic division seeding matches the actual imported SAPA organisation name', async () => {
    const { readFile } = await import('node:fs/promises');
    const captured = JSON.parse(await readFile(new URL('../scratch/player_rankings_response.json', import.meta.url), 'utf8'));
    const { rankedInAgeGroupLabel } = await import('../src/utils/playerRankingSelection.js');
    const rankings = captured.PlayerRankings.Payload.map((row) => ({
        org: row.RankingName,
        age_group: rankedInAgeGroupLabel(row.AgeGroup, row.RankingType),
        points: row.Points,
        rank: row.Position,
        match_type: 'Men-Doubles',
    }));
    const selected = resolvePlayerRanking({ rankings }, divisionRankingSource({ name: "Men's 40+" }));
    assert.equal(selected.points, 1936);
    assert.equal(selected.rank, '3');
    assert.equal(selected.missing, false);
});

test('SAPA aliases do not match unrelated ranking organisations', () => {
    const source = divisionRankingSource({ name: 'Mens 40+' });
    for (const org of ['SAPA', 'SAPA ranking', ' SAPA RANKING ']) {
        assert.equal(resolvePlayerRanking({ rankings: [{ org, age_group: 'Men Over 40', match_type: 'Doubles', points: 1936 }] }, source).points, 1936);
    }
    assert.equal(resolvePlayerRanking({ rankings: [{ org: 'SA Grand Tour', age_group: 'Men Over 40', match_type: 'Doubles', points: 9000 }] }, source).points, 0);
});
