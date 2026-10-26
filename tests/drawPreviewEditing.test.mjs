import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKnockoutDraft } from '../src/utils/nativeDrawGenerator.js';
import { firstRoundDrawSlots, moveDrawPreviewMatch, swapDrawPreviewPositions } from '../src/utils/drawPreviewEditing.js';
import { routeIds } from '../src/utils/drawBackplates.js';

const entries = count => Array.from({ length: count }, (_, index) => ({
    id: `entry-${index + 1}`, source_registration_id: `registration-${index + 1}`,
    team_name: `Team ${index + 1}`, seed_number: index + 1,
}));
const swap = (draw, a, b) => {
    const slots = firstRoundDrawSlots(draw.matches);
    return swapDrawPreviewPositions(draw, slots[a - 1], slots[b - 1]);
};
const seeds = draw => firstRoundDrawSlots(draw.matches).map(slot => slot.entry?.seed_number || null);

test('opening positions can be changed to match the RankedIn reference without changing seeds or entries', () => {
    const draw = generateKnockoutDraft(entries(8));
    const initial = swap(draw, 3, 7);
    assert.deepEqual(seeds(initial), [1, 8, 7, 4, 3, 6, 5, 2]);
    const updated = swap(initial, 3, 7);
    assert.deepEqual(seeds(updated), [1, 8, 5, 4, 3, 6, 7, 2]);
    assert.deepEqual(updated.entries, draw.entries);
    assert.deepEqual(seeds(initial), [1, 8, 7, 4, 3, 6, 5, 2], 'input remains unchanged');
    assert.equal(updated.matches.length, draw.matches.length);
    assert.equal(new Set(firstRoundDrawSlots(updated.matches).map(slot => slot.entry.id)).size, 8);
});

test('teams can exchange sides of the same match', () => {
    const draw = generateKnockoutDraft(entries(8));
    const updated = swap(draw, 1, 2);
    assert.deepEqual(seeds(updated).slice(0, 2), [8, 1]);
    assert.equal(updated.matches[0].source_slots[0].entry.seed_number, 8);
    assert.equal(updated.matches[0].source_slots[1].entry.seed_number, 1);
});

test('moving a team into a bye clears the old automatic advancement and advances the new bye winner', () => {
    const draw = generateKnockoutDraft(entries(5), { plateMode: 'all' });
    // [1, BYE], [5, 4], [3, BYE], [BYE, 2]. Move #5 opposite #1.
    const updated = swap(draw, 2, 3);
    const opening = updated.matches.filter(match => match.stage === 'knockout' && match.round_number === 1);
    assert.equal(opening[0].status, 'pending');
    assert.equal(opening[0].winner, null);
    assert.equal(opening[1].winner.seed_number, 4);
    const semifinal = updated.matches.find(match => match.key === 'r2-m1');
    assert.equal(semifinal.entry_one, null, 'old #1 bye advancement was cleared');
    assert.equal(semifinal.entry_two.seed_number, 4);
    for (const match of updated.matches.filter(match => match.stage === 'placement')) {
        assert.equal(match.entry_one, null, 'byes never invent a loser');
        assert.equal(match.entry_two, null);
    }
});

test('empty opening matches and multiple levels of automatic byes resolve after a swap', () => {
    const draw = generateKnockoutDraft(entries(3));
    const updated = swap(draw, 3, 2); // [1, 3], [BYE, 2]
    assert.equal(updated.matches.find(match => match.key === 'r2-m1').entry_one, null);
    assert.equal(updated.matches.find(match => match.key === 'r2-m1').entry_two.seed_number, 2);
    const emptyOpening = swap(updated, 4, 1); // [2, 3], [BYE, 1]
    assert.equal(emptyOpening.matches.find(match => match.key === 'r2-m1').entry_two.seed_number, 1);

    const six = generateKnockoutDraft(entries(6), { plateMode: 'all' });
    const slots = firstRoundDrawSlots(six.matches);
    const occupied = slots.find(slot => slot.position === 1);
    const destination = slots.find(slot => slot.entry && slots.some(other => other.matchKey === slot.matchKey && other.slotIndex !== slot.slotIndex && !other.entry) && slot.matchKey !== occupied.matchKey);
    const result = swapDrawPreviewPositions(six, occupied, slots.find(slot => slot.matchKey === destination.matchKey && !slot.entry));
    assert.equal(result.matches.find(match => match.key === occupied.matchKey).status, 'cancelled');
    assert.equal(result.matches.find(match => match.key === occupied.matchKey).winner, null);
});

test('saved drafts reconstruct winner and loser routes from database IDs for subsequent saves', () => {
    const draw = generateKnockoutDraft(entries(8), { plateMode: 'all' });
    const ids = new Map(draw.matches.map((match, index) => [match.key, `saved-${index}`]));
    const routes = routeIds(draw.matches, match => ids.get(match.key));
    const saved = { ...draw, format: 'knockout', matches: draw.matches.map(match => {
        const { source_slots, winner_to_match_key, loser_to_match_key, ...row } = match;
        return { ...row, id: ids.get(match.key), key: ids.get(match.key), ...routes.get(match.key) };
    }) };
    saved.matches[0].court_name = 'Court 2';
    saved.matches[0].scheduled_start = '2026-10-20T08:00:00+02:00';
    const updated = swap(saved, 3, 7);
    assert.deepEqual(seeds(updated), [1, 8, 7, 4, 3, 6, 5, 2]);
    assert.equal(updated.matches[0].court_name, 'Court 2');
    assert.equal(updated.matches[0].status, 'scheduled');
    const newRoutes = routeIds(updated.matches, match => `new-${match.key}`);
    for (const match of draw.matches) for (const result of ['winner', 'loser']) {
        const target = match[`${result}_to_match_key`];
        if (target) assert.equal(newRoutes.get(ids.get(match.key))[`${result}_to_match_id`], `new-${ids.get(target)}`);
    }
});

test('unseeded entrants remain unseeded after swapping', () => {
    const draw = generateKnockoutDraft(entries(8), { seededCount: 2, random: () => 0.5 });
    const slots = firstRoundDrawSlots(draw.matches);
    const unseeded = slots.find(slot => !slot.entry.seed_number);
    const seeded = slots.find(slot => slot.entry.seed_number === 1);
    const updated = swapDrawPreviewPositions(draw, seeded, unseeded);
    assert.equal(firstRoundDrawSlots(updated.matches).find(slot => slot.position === seeded.position).entry.seed_number, null);
    assert.equal(updated.entries.filter(entry => entry.seed_number).length, 2);
});

test('invalid positions, empty swaps, other formats and draws with results are rejected', () => {
    const draw = generateKnockoutDraft(entries(5));
    assert.throws(() => swapDrawPreviewPositions(draw, { matchKey: 'unknown', slotIndex: 0 }, firstRoundDrawSlots(draw.matches)[0]), /Choose two/);
    assert.throws(() => swap(draw, 2, 6), /at least one/);
    assert.throws(() => swap({ ...draw, format: 'group_only' }, 1, 3), /knockout/);
    for (const status of ['in_progress', 'completed', 'retired']) {
        const withResult = { ...draw, matches: draw.matches.map((match, index) => index === 1 ? { ...match, status, result_type: 'played' } : match) };
        assert.throws(() => swap(withResult, 1, 3), /after play or results/);
    }
});

test('moving the middle BYE and seed 2 match to the end restores the 14-team opening order', () => {
    const original = generateKnockoutDraft(entries(14), { placementPlayoff: 'top8', plateMode: 'triple' });
    const withByeInMiddle = moveDrawPreviewMatch(original, 'r1-m8', 'r1-m4');
    const middle = withByeInMiddle.matches.find(match => match.key === 'r1-m4');
    assert.equal(middle.entry_one, null);
    assert.equal(middle.entry_two.seed_number, 2);
    const updated = moveDrawPreviewMatch(withByeInMiddle, 'r1-m4', 'r1-m8');
    assert.deepEqual(firstRoundDrawSlots(updated.matches).map(slot => slot.entry), firstRoundDrawSlots(original.matches).map(slot => slot.entry));
    const slots = firstRoundDrawSlots(updated.matches);
    assert.equal(slots.length, 16);
    assert.equal(slots.filter(slot => !slot.entry).length, 2);
    assert.equal(new Set(slots.filter(slot => slot.entry).map(slot => slot.entry.id)).size, 14);
    assert.equal(slots[14].entry, null);
    assert.equal(slots[15].entry.seed_number, 2);
    assert.equal(updated.matches.find(match => match.key === 'r2-m4').entry_two.seed_number, 2);
    assert.equal(updated.matches.find(match => match.key === 'r2-m2').entry_two, null);
    assert.equal(withByeInMiddle.matches.find(match => match.key === 'r1-m4').entry_two.seed_number, 2, 'input was not mutated');
    assert.deepEqual(updated.entries, original.entries);
    assert.equal(updated.matches.length, original.matches.length);
});

test('moving a match shifts intervening pairings and keeps courts with their positions', () => {
    const draw = generateKnockoutDraft(entries(8));
    draw.matches[0].court_name = 'Court 1';
    draw.matches[3].court_name = 'Court 4';
    const pairings = draw.matches.filter(match => match.round_number === 1).map(match => [match.entry_one.id, match.entry_two.id]);
    const updated = moveDrawPreviewMatch(draw, 'r1-m1', 'r1-m4');
    assert.deepEqual(updated.matches.filter(match => match.round_number === 1).map(match => [match.entry_one.id, match.entry_two.id]), [...pairings.slice(1), pairings[0]]);
    assert.equal(updated.matches[0].court_name, 'Court 1');
    assert.equal(updated.matches[3].court_name, 'Court 4');
    assert.deepEqual(firstRoundDrawSlots(moveDrawPreviewMatch(updated, 'r1-m4', 'r1-m1').matches).map(slot => slot.entry), firstRoundDrawSlots(draw.matches).map(slot => slot.entry));
    assert.throws(() => moveDrawPreviewMatch(draw, 'r2-m1', 'r1-m4'), /opening-round/);
    const played = { ...draw, matches: draw.matches.map((match, index) => index === 0 ? { ...match, status: 'completed', result_type: 'played' } : match) };
    assert.throws(() => moveDrawPreviewMatch(played, 'r1-m1', 'r1-m4'), /after play or results/);
});
