/**
 * Pure native-draw generation helpers.  They deliberately have no Supabase or
 * UI dependency, which makes a generated draft easy to preview and edit before
 * it is persisted or published.
 */

export const nextPowerOfTwo = (value) => {
    const size = Math.max(2, Number(value) || 0);
    return 2 ** Math.ceil(Math.log2(size));
};

const shuffled = (items, random) => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
};

/** Standard tennis/padel seed order for a power-of-two bracket. */
export const seededSlotOrder = (drawSize) => {
    if (drawSize < 2 || (drawSize & (drawSize - 1)) !== 0) {
        throw new Error('Draw size must be a power of two of at least two');
    }
    let order = [1, 2];
    while (order.length < drawSize) {
        const nextSize = order.length * 2;
        order = order.flatMap((seed, index) => index % 2 === 0
            ? [seed, nextSize + 1 - seed]
            : [nextSize + 1 - seed, seed]);
    }
    return order;
};

const entrySort = (entries, seedingMethod, random, seededPercentage = 100) => {
    const active = entries.filter((entry) => entry.status !== 'withdrawn');
    if (seedingMethod === 'random') return shuffled(active, random);
    const ranked = [...active].sort((a, b) => {
        const aSeed = Number.isFinite(Number(a.seed_number)) ? Number(a.seed_number) : Infinity;
        const bSeed = Number.isFinite(Number(b.seed_number)) ? Number(b.seed_number) : Infinity;
        if (aSeed !== bSeed) return aSeed - bSeed;
        const aValue = Number(a.seeding_value || 0);
        const bValue = Number(b.seeding_value || 0);
        if (aValue !== bValue) return bValue - aValue;
        return String(a.team_name || '').localeCompare(String(b.team_name || ''));
    });
    if (seedingMethod === 'manual') return ranked;

    const percentage = Math.min(100, Math.max(0, Number(seededPercentage) || 0));
    const protectedCount = percentage === 100
        ? ranked.length
        : Math.floor(ranked.length * (percentage / 100));
    return [
        ...ranked.slice(0, protectedCount),
        ...shuffled(ranked.slice(protectedCount), random),
    ];
};

const knockoutRoundLabel = (roundNumber, totalRounds) => {
    const roundsRemaining = totalRounds - roundNumber;
    if (roundsRemaining === 0) return 'Final';
    if (roundsRemaining === 1) return 'Semifinals';
    if (roundsRemaining === 2) return 'Quarterfinals';
    return `Round of ${2 ** (roundsRemaining + 1)}`;
};

/**
 * Produces first-round slots and every subsequent knockout match. The top
 * seeds land in their correct bracket positions and receive any necessary
 * first-round byes before lower seeds do.
 */
export const generateKnockoutDraft = (entries, {
    seedingMethod = 'manual',
    seededPercentage = 100,
    placementPlayoff = 'none',
    random = Math.random,
} = {}) => {
    const orderedEntries = entrySort(entries, seedingMethod, random, seededPercentage).map((entry, index) => ({
        ...entry,
        seed_number: index + 1,
    }));
    if (orderedEntries.length < 2) throw new Error('At least two active entries are required');

    const drawSize = nextPowerOfTwo(orderedEntries.length);
    const seedOrder = seededSlotOrder(drawSize);
    const slots = seedOrder.map((seed) => orderedEntries[seed - 1] || null);
    const matches = [];
    let currentRoundSlots = slots.map((entry, index) => ({ type: 'entry', entry, slot: index + 1 }));
    let roundNumber = 1;

    while (currentRoundSlots.length > 1) {
        const nextRoundSlots = [];
        for (let index = 0; index < currentRoundSlots.length; index += 2) {
            const left = currentRoundSlots[index];
            const right = currentRoundSlots[index + 1];
            const isFirstRound = roundNumber === 1;
            const leftEntry = left.entry || null;
            const rightEntry = right.entry || null;
            const byeWinner = isFirstRound && Boolean(leftEntry) !== Boolean(rightEntry)
                ? (leftEntry || rightEntry)
                : null;
            const matchKey = `r${roundNumber}-m${(index / 2) + 1}`;
            matches.push({
                key: matchKey,
                stage: 'knockout',
                round_number: roundNumber,
                bracket_position: (index / 2) + 1,
                entry_one: leftEntry,
                entry_two: rightEntry,
                status: byeWinner ? 'completed' : 'pending',
                result_type: byeWinner ? 'walkover' : null,
                winner: byeWinner,
                source_slots: [left, right],
            });
            nextRoundSlots.push({ type: 'match', entry: byeWinner, source_match_key: matchKey });
        }
        currentRoundSlots = nextRoundSlots;
        roundNumber += 1;
    }

    const totalRounds = roundNumber - 1;
    const knockoutMatches = matches.map((match) => ({
        ...match,
        round_code: `r${totalRounds - match.round_number + 1}`,
        round_label: knockoutRoundLabel(match.round_number, totalRounds),
    }));

    const placementMatches = [];
    if (placementPlayoff === 'top4' && totalRounds >= 2) {
        const semifinalRound = totalRounds - 1;
        const semifinalMatches = knockoutMatches
            .filter((match) => match.round_number === semifinalRound)
            .sort((a, b) => a.bracket_position - b.bracket_position);
        if (semifinalMatches.length === 2) {
            const placementKey = 'placement-3-4';
            semifinalMatches.forEach((match, index) => {
                match.loser_to_match_key = placementKey;
                match.loser_to_slot = index + 1;
            });
            placementMatches.push({
                key: placementKey,
                stage: 'placement',
                round_code: '3_4',
                round_label: '3rd place playoff',
                round_number: totalRounds,
                bracket_position: 2,
                entry_one: null,
                entry_two: null,
                status: 'pending',
                result_type: null,
                winner: null,
                source_slots: semifinalMatches.map((match) => ({
                    type: 'loser',
                    entry: null,
                    source_match_key: match.key,
                })),
            });
        }
    }

    return {
        draw_size: drawSize,
        total_rounds: totalRounds,
        entries: orderedEntries,
        seeded_percentage: Math.min(100, Math.max(0, Number(seededPercentage) || 0)),
        placement_playoff: placementPlayoff,
        matches: [...knockoutMatches, ...placementMatches],
    };
};

/** Assigns teams to groups in a seeded snake: A/B/C then C/B/A, repeatedly. */
export const allocateSnakeGroups = (entries, groupCount, { seedingMethod = 'manual', seededPercentage = 100, random = Math.random } = {}) => {
    const count = Number(groupCount);
    if (!Number.isInteger(count) || count < 1) throw new Error('At least one group is required');
    const ordered = entrySort(entries, seedingMethod, random, seededPercentage).map((entry, index) => ({
        ...entry,
        seed_number: index + 1,
    }));
    if (ordered.length < count) throw new Error('There must be at least one entry per group');
    const groups = Array.from({ length: count }, (_, index) => ({
        key: `group-${index + 1}`,
        name: `Group ${String.fromCharCode(65 + index)}`,
        display_order: index + 1,
        entries: [],
    }));

    ordered.forEach((entry, index) => {
        const wave = Math.floor(index / count);
        const offset = index % count;
        const groupIndex = wave % 2 === 0 ? offset : count - 1 - offset;
        groups[groupIndex].entries.push(entry);
    });
    return groups;
};

/** Circle-method fixtures, including a null bye when a group has an odd size. */
export const generateRoundRobinFixtures = (entries) => {
    if (entries.length < 2) return [];
    const rotation = [...entries];
    if (rotation.length % 2 === 1) rotation.push(null);
    const half = rotation.length / 2;
    const fixtures = [];

    for (let round = 0; round < rotation.length - 1; round += 1) {
        for (let i = 0; i < half; i += 1) {
            const leftEntry = rotation[i];
            const rightEntry = rotation[rotation.length - 1 - i];
            if (leftEntry && rightEntry) {
                // RankedIn presents the lower seed on the left for every
                // round-robin row. Normalising the display sides also keeps a
                // manually matched legacy draw stable across regeneration.
                const leftSeed = Number(leftEntry.seed_number || Infinity);
                const rightSeed = Number(rightEntry.seed_number || Infinity);
                const [entryOne, entryTwo] = leftSeed <= rightSeed
                    ? [leftEntry, rightEntry]
                    : [rightEntry, leftEntry];
                fixtures.push({
                    key: `group-r${round + 1}-m${i + 1}`,
                    stage: 'group',
                    round_code: `group_r${round + 1}`,
                    round_label: `Group stage · Round ${round + 1}`,
                    round_number: round + 1,
                    bracket_position: i + 1,
                    entry_one: entryOne,
                    entry_two: entryTwo,
                    status: 'pending',
                });
            }
        }
        rotation.splice(1, 0, rotation.pop());
    }
    return fixtures;
};

export const generateGroupStageDraft = (entries, options) => {
    const groups = allocateSnakeGroups(entries, options.groupCount, options);
    const populatedGroups = groups.map((group) => ({
        ...group,
        entries: group.entries.map((entry) => ({ ...entry, group_key: group.key })),
        fixtures: generateRoundRobinFixtures(group.entries).map((fixture) => ({ ...fixture, group_key: group.key })),
    }));
    return {
        format: options.format || 'group_only',
        seeded_percentage: Math.min(100, Math.max(0, Number(options.seededPercentage) || 0)),
        groups: populatedGroups,
        entries: populatedGroups.flatMap((group) => group.entries),
        matches: populatedGroups.flatMap((group) => group.fixtures),
    };
};
