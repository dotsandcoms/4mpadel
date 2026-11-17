import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateSnakeGroups, generateGroupStageDraft, generateKnockoutDraft } from '../src/utils/nativeDrawGenerator.js';
import { editGroupTeams, groupSwapTargets, groupSwapWarnings, hasGroupPlayStarted } from '../src/utils/drawGroupEditing.js';
import { defaultQualificationRules, qualificationSize, rankGroupQualifiers } from '../src/utils/drawQualification.js';

const teams = count => Array.from({ length: count }, (_, index) => ({
    id: `team-${index + 1}`, seed_number: index + 1, team_name: `Team ${index + 1}`,
}));
const seeds = groups => groups.map(group => group.entries.map(team => team.seed_number));

test('strict group pots match the PDF for 20 in four groups and 13 in three groups', () => {
    for (const [count, groups, expected] of [
        [20, 4, [[1, 8, 9, 16, 17], [2, 7, 10, 15, 18], [3, 6, 11, 14, 19], [4, 5, 12, 13, 20]]],
        [13, 3, [[1, 6, 7, 12, 13], [2, 5, 8, 11], [3, 4, 9, 10]]],
        [18, 4, [[1, 8, 9, 16, 17], [2, 7, 10, 15, 18], [3, 6, 11, 14], [4, 5, 12, 13]]],
        [14, 4, [[1, 8, 9, 13], [2, 7, 10, 14], [3, 6, 11], [4, 5, 12]]],
    ]) {
        const draw = generateGroupStageDraft(teams(count), { seededCount: count, groupCount: groups, random: () => 0 });
        assert.deepEqual(seeds(draw.groups), expected);
        assert.equal(draw.matches.length, new Set(draw.matches.map(match => match.key)).size);
    }
});

test('random pots keep seeds one and two fixed and each full pot represented', () => {
    const groups = allocateSnakeGroups(teams(20), 4, { seededCount: 20, groupSeeding: 'random_pots', random: () => 0 });
    const rows = seeds(groups);
    assert.deepEqual(rows.slice(0, 2).map(row => row[0]), [1, 2]);
    assert.notDeepEqual(rows, seeds(allocateSnakeGroups(teams(20), 4, { seededCount: 20 })));
    assert.ok(rows.every(row => row.every((seed, index) => Math.floor((seed - 1) / 4) === index)));
    const partial = allocateSnakeGroups(teams(22), 6, { seededCount: 22, groupSeeding: 'random_pots', random: () => 0 });
    assert.deepEqual(partial.filter(group => group.entries.length === 4).map(group => group.entries[0].seed_number).sort(), [1, 2, 3, 4]);
});

test('swaps maintain fixture slots, warn for new top seed and club conflicts, and lock started groups', () => {
    const entries = teams(8);
    entries[0].snapshot = { clubs: ['club'] };
    entries[1].snapshot = { clubs: ['club'] };
    const draft = generateGroupStageDraft(entries, { groupCount: 2 });
    const [a, b] = draft.groups;
    const source = { groupKey: a.key, entry: a.entries[0] };
    const target = groupSwapTargets(draft, source, 2).find(slot => slot.entry.seed_number === 3);
    const fixture = draft.matches.find(match => match.group_key === a.key && match.entry_one.id === source.entry.id);
    fixture.scheduled_start = '2026-11-17T10:00:00Z';
    const edited = editGroupTeams(draft, source, target, 2);
    assert.deepEqual(seeds(edited.groups), [[3, 4, 5, 8], [1, 2, 6, 7]]);
    assert.equal(edited.matches.find(match => match.key === fixture.key).scheduled_start, fixture.scheduled_start);
    assert.equal(edited.matches.find(match => match.key === fixture.key).entry_one.id, target.entry.id);
    assert.equal(groupSwapWarnings(draft, edited, [a.key, b.key]).length, 2);
    fixture.status = 'in_progress';
    assert.equal(hasGroupPlayStarted(draft.matches, [a.key]), true);
    assert.throws(() => editGroupTeams(draft, source, target, 2), /no recorded play/);
    assert.ok(groupSwapTargets(draft, { groupKey: b.key }, 2).every(slot => slot.groupKey !== a.key));
});

test('moving into an open spot rebuilds complete groups and retains unaffected bookings', () => {
    const draft = generateGroupStageDraft(teams(13), { groupCount: 3 });
    const [a, b, c] = draft.groups;
    const source = { groupKey: a.key, entry: a.entries.at(-1) };
    const target = groupSwapTargets(draft, source, 2).find(slot => slot.groupKey === b.key && !slot.entry);
    const unchanged = draft.matches.find(match => match.group_key === c.key);
    const booking = draft.matches.find(match => match.group_key === a.key && ![match.entry_one, match.entry_two].includes(source.entry));
    booking.id = 'kept-fixture';
    booking.scheduled_start = '2026-11-17T10:00:00Z';
    const edited = editGroupTeams(draft, source, target, 2);
    assert.deepEqual(edited.groups.map(group => group.entries.length), [4, 5, 4]);
    assert.equal(edited.matches.length, draft.matches.length);
    assert.equal(edited.matches.find(match => match.id === booking.id).scheduled_start, booking.scheduled_start);
    assert.ok(edited.matches.includes(unchanged));
    const moved = edited.groups[1].entries.find(entry => entry.id === source.entry.id);
    const reverse = editGroupTeams(edited, { groupKey: b.key, entry: moved }, { groupKey: a.key, entry: null }, 2);
    assert.deepEqual(seeds(reverse.groups), seeds(draft.groups));
    assert.ok(groupSwapTargets(draft, source, 5).every(slot => slot.entry));
});

function completedGroups(sizes) {
    const groups = sizes.map((_, index) => ({ id: `group-${index}`, name: `Group ${index + 1}` }));
    const entries = groups.flatMap((group, index) => teams(sizes[index]).map((team, i) => ({
        ...team, id: `${group.id}-${i + 1}`, group_id: group.id, team_name: `${group.name} Team ${i + 1}`,
    })));
    const matches = [];
    const matchSets = [];
    groups.forEach((group, groupIndex) => {
        const members = entries.filter(team => team.group_id === group.id);
        members.forEach((one, index) => members.slice(index + 1).forEach(two => {
            const id = `${one.id}:${two.id}`;
            matches.push({ id, group_id: group.id, entry_one_id: one.id, entry_two_id: two.id,
                winner_entry_id: one.id, status: 'completed', result_summary: [2, 0] });
            for (let set = 0; set < 2; set++) matchSets.push({
                match_id: id, entry_one_games: 6, entry_two_games: groupIndex,
            });
        }));
    });
    return { groups, entries, matches, matchSets, rules: defaultQualificationRules, drawId: 'saved-draw' };
}

test('best-placed teams are compared at the same position and exclude bottom finishers in larger groups', () => {
    const input = { ...completedGroups([4, 5, 4]), mode: 'best_placed', places: 2, extras: 2 };
    const ranked = rankGroupQualifiers(input);
    assert.equal(ranked.advancing.length, 8);
    assert.ok(ranked.comparison.every(row => row.position === 3 && row.played === 3 && row.won === 1 && row.standings_points === 2));
    const larger = ranked.comparison.find(row => row.group === 'Group 2');
    assert.deepEqual([larger.excluded, larger.sets_for, larger.sets_against, larger.games_for, larger.games_against], [1, 2, 4, 16, 26]);
    const override = ranked.comparison.slice(1).map(row => row.entry_id);
    const overridden = rankGroupQualifiers({ ...input, overrideIds: override });
    assert.deepEqual(overridden.advancing.slice(6).map(team => team.id), override);
    assert.equal(overridden.comparison.filter(row => row.qualified !== row.automatic).length, 2);
    assert.deepEqual(qualificationSize([4, 4, 4], 'best_placed', 2, 2), { total: 8, candidates: 3, bracket: 8, clean: true });
    assert.deepEqual(qualificationSize([5, 5, 5, 5, 5], 'best_placed', 3, 1), { total: 16, candidates: 5, bracket: 16, clean: true });
    assert.equal(qualificationSize([4, 4, 4], 'best_placed', 2, 1).clean, false);
});

test('configurable cross-group order and recorded lots govern equally placed teams', () => {
    const fixture = completedGroups([3, 3]);
    const scores = {
        'group-0-1:group-0-2': [6, 1],
        'group-0-2:group-0-3': [6, 0],
        'group-1-1:group-1-2': [6, 4],
        'group-1-2:group-1-3': [7, 6],
    };
    fixture.matchSets.forEach(set => {
        if (scores[set.match_id]) [set.entry_one_games, set.entry_two_games] = scores[set.match_id];
    });
    const input = { ...fixture, mode: 'best_placed', places: 1, extras: 1 };
    assert.equal(rankGroupQualifiers(input).autoIds[0], 'group-0-2');
    assert.equal(rankGroupQualifiers({ ...input, rules: ['won', 'games_for', 'game_difference'] }).autoIds[0], 'group-1-2');
    const tied = rankGroupQualifiers({ ...input, rules: ['won'] });
    assert.ok(tied.comparison.every(row => row.decidedByLot));
    assert.deepEqual(rankGroupQualifiers({ ...input, rules: ['won'] }).autoIds, tied.autoIds);
});

test('all-team qualification seeds by finish, keeps same-group teams apart and gives the highest seeds byes', () => {
    const ranked = rankGroupQualifiers({ ...completedGroups([5, 4, 4]), mode: 'all', places: 1, extras: 0 });
    assert.equal(ranked.advancing.length, 13);
    assert.ok(ranked.advancing.slice(0, 3).every(team => team.id.endsWith('-1')));
    assert.ok(ranked.advancing.slice(3, 6).every(team => team.id.endsWith('-2')));
    const knockout = generateKnockoutDraft(ranked.advancing, { separateGroups: true });
    assert.equal(knockout.draw_size, 16);
    const opening = knockout.matches.filter(match => match.round_number === 1);
    assert.deepEqual(opening.filter(match => match.winner).map(match => match.winner.seed_number).sort(), [1, 2, 3]);
    assert.ok(opening.filter(match => match.entry_one && match.entry_two).every(match => match.entry_one.group_id !== match.entry_two.group_id));
});
