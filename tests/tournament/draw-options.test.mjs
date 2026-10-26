import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDivisionDraw } from '../../src/utils/tournament/draws.js';
const data = { players: [], registrations: Array.from({ length: 16 }, (_, i) => ({ id: `r${i}`, division_id: 'd', full_name: `Player ${i}`, partner_name: `Partner ${i}`, email: `p${i}@test.local`, partner_email: `q${i}@test.local` })) };
const review = { excluded: [], seeds: data.registrations.map(r => r.id) };
test('tournament generation honours protected seed count and manual priority', () => {
    const draft = generateDivisionDraw(data, 'd', { format: 'knockout', seeded_team_count: 4 }, review);
    assert.deepEqual(draft.entries.filter(e => e.seed_number).map(e => e.source_registration_id).sort(), ['r0','r1','r2','r3']);
    assert.equal(draft.entries.filter(e => e.seed_number === null).length, 12);
});
test('custom placement selections retain feeders and do not create unrelated ranges', () => {
    const draft = generateDivisionDraw(data, 'd', { format: 'knockout', seeded_team_count: 0, plate_mode: ['places_13_16'] }, review);
    assert.ok(draft.entries.every(e => e.seed_number === null));
    assert.ok(draft.matches.some(m => m.round_code.startsWith('places_13_16')));
    assert.ok(draft.matches.some(m => m.round_code.startsWith('places_9_16')));
    assert.ok(!draft.matches.some(m => m.round_code.startsWith('places_5_8')));
    const ids = new Set(draft.matches.map(m => m.id));
    for (const match of draft.matches) for (const target of [match.winner_to_match_id, match.loser_to_match_id]) if (target) assert.ok(ids.has(target));
});

test('PDF exports contain the full list, wrap long names and paginate', async () => {
    const { buildDivisionListPdf } = await import('../../src/utils/tournament/exports.js');
    const rows = Array.from({ length: 100 }, (_, i) => ({ id: i, full_name: `Player ${i} with a long full name`, partner_name: `Partner ${i}`, payment_status: 'paid' }));
    const options = { event: { event_name: 'Test event' }, division: { name: 'Test division' }, rows, entries: rows.map(r => ({ team_name: r.full_name, seeding_value: 5 })), review: {}, seededCount: 4 };
    const players = buildDivisionListPdf(options);
    assert.ok(players.getNumberOfPages() > 1);
    assert.ok(players.output().includes('Player 99'));
    const seeds = buildDivisionListPdf({ ...options, seeded: true });
    assert.ok(seeds.output().includes('Seed 4'));
    assert.ok(seeds.output().includes('Unseeded'));
    assert.ok(seeds.output().includes('Working copy - not confirmed'));
});
