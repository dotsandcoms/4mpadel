import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKnockoutDraft } from '../src/utils/nativeDrawGenerator.js';
import { routeIds, resolveDrawRoutes } from '../src/utils/drawBackplates.js';
import { deriveKnockoutPlacementProposals } from '../src/utils/nativeDrawPlacements.js';
import { generateDivisionDraw, generateElimination } from '../src/utils/tournament/draws.js';

const entries = count => Array.from({ length: count }, (_, i) => ({ id: `e${i}`, source_registration_id: `r${i}`, team_name: `Team ${i + 1}`, seed_number: i + 1 }));
const ranges = draw => [...new Set(draw.matches.filter(m => m.stage === 'placement').map(m => m.round_code.replace(/_r\d+$/, '')))].sort();
const savedMatches = draw => {
    const routes = routeIds(draw.matches, match => match.key);
    return draw.matches.map(match => ({ ...match, id: match.key,
        entry_one_id: match.entry_one?.id || null, entry_two_id: match.entry_two?.id || null,
        winner_entry_id: match.winner?.id || null, ...routes.get(match.key),
    }));
};
const finish = draw => {
    let matches = resolveDrawRoutes(savedMatches(draw));
    for (let pass = 0; pass < matches.length; pass++) {
        const match = matches.find(m => m.status === 'pending' && m.entry_one_id && m.entry_two_id);
        if (!match) break;
        Object.assign(match, { status: 'completed', result_type: 'played', winner_entry_id: match.entry_one_id, loser_entry_id: match.entry_two_id });
        matches = resolveDrawRoutes(matches);
    }
    assert.ok(matches.every(m => ['completed', 'walkover', 'cancelled'].includes(m.status)), 'every branch completes, including byes');
    return matches;
};

test('14-team triple plate plus Top 8 has exactly the Men 45+ RankedIn placement ranges', () => {
    const draw = generateKnockoutDraft(entries(14), { plateMode: 'triple', placementPlayoff: 'top8' });
    assert.deepEqual(ranges(draw), ['3_4', 'places_13_16', 'places_5_8', 'places_7_8', 'places_9_16']);
    assert.equal(draw.matches.length, 30);
    const quarters = draw.matches.filter(m => m.stage === 'knockout' && m.round_label === 'Quarterfinals');
    assert.equal(quarters.length, 4);
    for (const match of quarters) assert.match(match.loser_to_match_key, /^places_5_8_r1_/);
    for (const match of draw.matches.filter(m => m.stage === 'knockout' && m.round_number === 1)) assert.match(match.loser_to_match_key, /^places_9_16_r1_/);
    for (const match of draw.matches.filter(m => m.round_code === 'places_5_8_r1')) assert.match(match.loser_to_match_key, /^places_7_8_r1_/);
});

for (const count of [8, 14, 32]) for (const plateMode of ['none', 'double', 'triple', 'all', [], ['places_13_16']]) {
    test(`Top 8 with ${count} teams and ${JSON.stringify(plateMode)} keeps unique, complete routes`, () => {
        const draw = generateKnockoutDraft(entries(count), { plateMode, placementPlayoff: 'top8' });
        assert.equal(new Set(draw.matches.map(m => m.key)).size, draw.matches.length);
        assert.equal(new Set(draw.matches.map(m => `${m.stage}:${m.round_number}:${m.bracket_position}`)).size, draw.matches.length);
        for (const range of ['places_5_8', 'places_7_8']) assert.ok(ranges(draw).includes(range));
        assert.ok(ranges(draw).some(range => ['3_4', 'places_3_4'].includes(range)));
        const byKey = new Map(draw.matches.map(match => [match.key, match]));
        for (const match of draw.matches) for (const [index, source] of (match.source_slots || []).entries()) {
            if (!source.source_match_key) continue;
            const feeder = byKey.get(source.source_match_key);
            assert.ok(feeder);
            const result = source.type === 'loser' ? 'loser' : 'winner';
            assert.equal(feeder[`${result}_to_match_key`], match.key);
            assert.equal(feeder[`${result}_to_slot`], index + 1);
        }
        const matches = finish(draw);
        const proposals = deriveKnockoutPlacementProposals({ entries: draw.entries, matches, tierCode: 'major' });
        assert.deepEqual(proposals.slice(0, 8).map(row => row.placement), ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th']);
        assert.equal(new Set(proposals.slice(0, 8).map(row => row.entry_id)).size, 8);
        assert.ok(proposals.slice(4, 8).every(row => row.roundCode === 'quarterfinal_5_8'));
    });
}

test('Top 4 remains separate from Top 8, and small brackets cannot request Top 8', () => {
    const draw = generateKnockoutDraft(entries(14), { plateMode: 'triple', placementPlayoff: 'top4' });
    assert.deepEqual(ranges(draw), ['3_4', 'places_13_16', 'places_9_16']);
    assert.throws(() => generateKnockoutDraft(entries(4), { placementPlayoff: 'top8' }), /8-slot/);
});

test('tournament workflow generates persistable Top 8 matches and routes', () => {
    const registrations = entries(14).map((entry, i) => ({ id: entry.source_registration_id, division_id: 'division', full_name: `Player ${i}`, partner_name: `Partner ${i}`, email: `p${i}@test.local`, partner_email: `q${i}@test.local` }));
    const draw = generateDivisionDraw({ registrations, players: [] }, 'division', { format: 'knockout', plate_mode: 'triple', playoff_mode: 'top8' }, {});
    assert.deepEqual(ranges(draw), ['3_4', 'places_13_16', 'places_5_8', 'places_7_8', 'places_9_16']);
    const ids = new Set(draw.matches.map(match => match.id));
    for (const match of draw.matches) for (const result of ['winner', 'loser']) {
        const target = match[`${result}_to_match_id`];
        if (target) assert.ok(ids.has(target));
    }
});

test('group qualifiers retain the Top 8 playoff setting when elimination is created', () => {
    const qualified = entries(8).map((entry, i) => ({ ...entry, draw_id: 'draw', group_id: `g${i % 2}` }));
    const standings = qualified.map((entry, i) => ({ draw_id: 'draw', group_id: entry.group_id, position: Math.floor(i / 2) + 1, entry_id: entry.id }));
    const matches = generateElimination({ entries: qualified, standings }, { id: 'draw', advancers_per_group: 4, scoring_rules: { playoff_mode: 'top8' } });
    assert.deepEqual(ranges({ matches }), ['3_4', 'places_5_8', 'places_7_8']);
});
