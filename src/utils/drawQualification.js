import { calculateGroupStandings } from './nativeDrawStandings.js';
import { nextPowerOfTwo } from './nativeDrawGenerator.js';

export const qualificationRuleLabels = {
    won: 'Matches won',
    set_difference: 'Set difference',
    game_difference: 'Game difference',
    games_for: 'Games won',
    draw: 'Draw lots',
};
export const defaultQualificationRules = Object.keys(qualificationRuleLabels);

export function qualificationRules(rules) {
    const stats = Array.isArray(rules)
        ? [...new Set(rules.filter(rule => rule !== 'draw' && Object.hasOwn(qualificationRuleLabels, rule)))]
        : defaultQualificationRules.slice(0, -1);
    return [...stats, 'draw'];
}

export function qualificationSize(groupSizes, mode, places, extras) {
    const automatic = mode === 'all'
        ? groupSizes.reduce((total, size) => total + size, 0)
        : groupSizes.reduce((total, size) => total + Math.min(size, places), 0);
    const candidates = groupSizes.filter(size => size > places).length;
    const total = automatic + (mode === 'best_placed' ? extras : 0);
    return { total, candidates, bracket: nextPowerOfTwo(total), clean: [4, 8, 16, 32].includes(total) };
}

function lotValue(key) {
    // The saved draw ID supplies a random salt and keeps tied lots stable on reload.
    let hash = 0x811c9dc5;
    for (const character of key) hash = Math.imul(hash ^ character.charCodeAt(0), 0x01000193);
    return hash >>> 0;
}

export function rankGroupQualifiers({ groups, entries, matches, matchSets, mode, places, extras, rules, drawId, overrideIds }) {
    const groupTables = groups.map(group => ({
        group,
        rows: calculateGroupStandings({ entries, matches, matchSets, groupId: group.id }),
    }));
    const metrics = qualificationRules(rules);
    const compare = (a, b) => {
        for (const rule of metrics) {
            if (a[rule] !== b[rule]) return rule === 'draw' ? a.draw - b.draw : b[rule] - a[rule];
        }
        return a.entry_id.localeCompare(b.entry_id);
    };
    const entryById = new Map(entries.map(entry => [entry.id, entry]));
    const forPosition = position => {
        const eligible = groupTables.filter(table => table.rows.length >= position);
        const smallestSize = Math.min(...eligible.map(table => table.rows.length));
        return eligible.map(({ group, rows }) => {
            const row = rows[position - 1];
            const excluded = rows.slice(smallestSize).map(item => item.entry_id);
            const adjusted = excluded.length ? calculateGroupStandings({
                entries, groupId: group.id, matchSets,
                matches: matches.filter(match => !excluded.includes(match.entry_one_id) && !excluded.includes(match.entry_two_id)),
            }).find(item => item.entry_id === row.entry_id) : row;
            return {
                ...adjusted, group: group.name, position, team: entryById.get(row.entry_id)?.team_name,
                set_difference: adjusted.sets_for - adjusted.sets_against,
                game_difference: adjusted.games_for - adjusted.games_against,
                excluded: excluded.length,
                draw: lotValue(`${drawId}:${row.entry_id}`),
            };
        }).sort(compare);
    };

    const lastAutomatic = mode === 'all' ? Math.max(0, ...groupTables.map(table => table.rows.length)) : places;
    const automatic = Array.from({ length: lastAutomatic }, (_, index) => {
        const position = index + 1;
        if (mode !== 'fixed') return forPosition(position);
        return groupTables.flatMap(({ rows }) => rows[position - 1] || []);
    }).flat();
    const candidates = mode === 'best_placed' ? forPosition(places + 1) : [];
    const autoIds = candidates.slice(0, extras).map(row => row.entry_id);
    const selected = overrideIds ?? autoIds;
    const comparison = candidates.map((row, index) => ({
        ...row, automatic: autoIds.includes(row.entry_id), qualified: selected.includes(row.entry_id),
        decidedByLot: candidates.some((other, otherIndex) => row.entry_id !== other.entry_id
            && (index < extras) !== (otherIndex < extras)
            && metrics.filter(rule => rule !== 'draw').every(rule => row[rule] === other[rule])),
    }));
    const advancing = [...automatic, ...comparison.filter(row => row.qualified)].map((row, index) => ({
        ...entryById.get(row.entry_id), seed_number: index + 1,
    }));
    return { advancing, comparison, autoIds };
}
