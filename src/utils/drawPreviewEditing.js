const matchKey = (match) => match.key || match.id;

export function firstRoundDrawSlots(matches) {
    return matches.filter(match => match.stage === 'knockout' && match.round_number === 1)
        .sort((a, b) => a.bracket_position - b.bracket_position)
        .flatMap(match => [match.entry_one, match.entry_two].map((entry, slotIndex) => ({
            matchKey: matchKey(match), slotIndex, entry,
            position: (match.bracket_position - 1) * 2 + slotIndex + 1,
        })));
}

function assertEditableDraw(draft) {
    if ((draft.format || 'knockout') !== 'knockout') throw new Error('Position swaps are available for knockout draws.');
    if (draft.matches.some(match => ['in_progress', 'retired'].includes(match.status)
        || (match.status === 'completed' && match.result_type !== 'walkover')
        || ['played', 'retirement', 'withdrawal'].includes(match.result_type))) {
        throw new Error('Teams cannot be swapped after play or results have started.');
    }
}

/** Swap opening positions without reseeding or regenerating the random draw. */
export function swapDrawPreviewPositions(draft, from, to) {
    assertEditableDraw(draft);
    const slots = firstRoundDrawSlots(draft.matches);
    const findSlot = value => slots.find(slot => slot.matchKey === value.matchKey && slot.slotIndex === value.slotIndex);
    const source = findSlot(from);
    const target = findSlot(to);
    if (!source || !target) throw new Error('Choose two opening-round positions to swap.');
    if (source.position === target.position) return draft;
    if (!source.entry && !target.entry) throw new Error('Choose at least one position with a team.');
    return replaceOpeningPositions(draft, [{ ...source, entry: target.entry }, { ...target, entry: source.entry }]);
}

/** Move a whole pairing, shifting the intervening matches rather than swapping them. */
export function moveDrawPreviewMatch(draft, fromKey, toKey) {
    assertEditableDraw(draft);
    const opening = draft.matches.filter(match => match.stage === 'knockout' && match.round_number === 1)
        .sort((a, b) => a.bracket_position - b.bracket_position);
    const from = opening.findIndex(match => matchKey(match) === fromKey);
    const to = opening.findIndex(match => matchKey(match) === toKey);
    if (from < 0 || to < 0) throw new Error('Choose two opening-round matches.');
    if (from === to) return draft;
    const reordered = [...opening];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    const positions = opening.flatMap((match, index) => [0, 1].map(slotIndex => ({
        matchKey: matchKey(match), slotIndex,
        entry: reordered[index][slotIndex === 0 ? 'entry_one' : 'entry_two'],
    })));
    return replaceOpeningPositions(draft, positions);
}

function replaceOpeningPositions(draft, positions) {
    const matches = draft.matches.map(match => ({ ...match, key: matchKey(match) }));
    const byKey = new Map(matches.map(match => [match.key, match]));
    const byId = new Map(matches.filter(match => match.id).map(match => [match.id, match]));
    for (const position of positions) byKey.get(position.matchKey)[position.slotIndex === 0 ? 'entry_one' : 'entry_two'] = position.entry || null;
    const feeders = new Map();
    // Saved draws carry database IDs; generated previews carry local route keys.
    for (const match of matches) for (const result of ['winner', 'loser']) {
        const next = byKey.get(match[`${result}_to_match_key`]) || byId.get(match[`${result}_to_match_id`]);
        match[`${result}_to_match_key`] = next?.key || null;
        if (next) feeders.set(`${next.key}:${match[`${result}_to_slot`] - 1}`, { match, result });
    }

    const resolved = new Map();
    const visiting = new Set();
    const resolve = match => {
        if (resolved.has(match.key)) return resolved.get(match.key);
        if (visiting.has(match.key)) throw new Error('The draw contains a circular match route. Generate a new preview.');
        visiting.add(match.key);
        const opening = match.stage === 'knockout' && match.round_number === 1;
        const known = [0, 1].map(slotIndex => {
            const name = slotIndex === 0 ? 'entry_one' : 'entry_two';
            const feeder = feeders.get(`${match.key}:${slotIndex}`);
            if (feeder) {
                const ready = resolve(feeder.match);
                match[name] = ready ? feeder.match[feeder.result] : null;
                return ready;
            }
            if (!opening) match[name] = null;
            return opening;
        });
        match.source_slots = [0, 1].map(slotIndex => {
            const feeder = feeders.get(`${match.key}:${slotIndex}`);
            return {
                type: feeder ? (feeder.result === 'loser' ? 'loser' : 'match') : 'entry',
                ...(feeder ? { source_match_key: feeder.match.key } : { slot: (match.bracket_position - 1) * 2 + slotIndex + 1 }),
                entry: match[slotIndex === 0 ? 'entry_one' : 'entry_two'],
            };
        });
        const entrants = [match.entry_one, match.entry_two].filter(Boolean);
        const automatic = known.every(Boolean) && entrants.length < 2;
        match.status = automatic ? (entrants.length ? 'walkover' : 'cancelled') : (match.scheduled_start ? 'scheduled' : 'pending');
        match.result_type = automatic ? (entrants.length ? 'walkover' : 'cancelled') : null;
        match.winner = automatic ? entrants[0] || null : null;
        match.loser = null;
        match.entry_one_id = match.entry_one?.id || null;
        match.entry_two_id = match.entry_two?.id || null;
        match.winner_entry_id = match.winner?.id || null;
        match.loser_entry_id = null;
        visiting.delete(match.key);
        resolved.set(match.key, automatic);
        return automatic;
    };
    matches.forEach(resolve);
    return { ...draft, matches };
}
