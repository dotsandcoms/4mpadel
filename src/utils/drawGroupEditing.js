import { generateRoundRobinFixtures, groupSeedOrder } from './nativeDrawGenerator.js';

export const drawTeamKey = entry => entry?.id || entry?.source_registration_id;
const groupKey = group => group.id || group.key;
const matchGroup = match => match.group_id || match.group_key;
const pairKey = (one, two) => [drawTeamKey(one), drawTeamKey(two)].sort().join(':');

export const hasGroupPlayStarted = (matches, keys) => matches.some(match =>
    match.stage === 'group'
    && (!keys || keys.includes(matchGroup(match)))
    && !['pending', 'scheduled'].includes(match.status)
);

export function groupSwapTargets(draft, source, minimumSize) {
    const capacity = Math.max(...draft.groups.map(group => group.entries.length));
    return draft.groups.flatMap(group => {
        const key = groupKey(group);
        if (key === source.groupKey || hasGroupPlayStarted(draft.matches, [key])) return [];
        const targets = group.entries.map(entry => ({ entry, groupKey: key, position: group.name }));
        const sourceGroup = draft.groups.find(item => groupKey(item) === source.groupKey);
        if (group.entries.length < capacity && sourceGroup?.entries.length > minimumSize) {
            targets.push({ entry: null, groupKey: key, position: group.name });
        }
        return targets;
    });
}

export function editGroupTeams(draft, source, target, minimumSize = 1) {
    const touched = [source.groupKey, target.groupKey];
    if (touched[0] === touched[1] || !source.entry || hasGroupPlayStarted(draft.matches, touched)) {
        throw new Error('Choose two different groups that have no recorded play.');
    }
    const destination = groupSwapTargets(draft, source, minimumSize).find(option =>
        option.groupKey === target.groupKey && drawTeamKey(option.entry) === drawTeamKey(target.entry));
    if (!destination) throw new Error('This destination is no longer available.');

    const outgoing = [source.entry, destination.entry];
    const groups = draft.groups.map(group => {
        const key = groupKey(group);
        const index = touched.indexOf(key);
        if (index === -1) return group;
        const leaving = drawTeamKey(outgoing[index]);
        const incoming = outgoing[1 - index];
        const entries = group.entries.filter(entry => drawTeamKey(entry) !== leaving);
        if (incoming) entries.push({ ...incoming, group_key: key, ...(group.id && { group_id: key }) });
        entries.sort(groupSeedOrder);
        const oldFixtures = draft.matches.filter(match => matchGroup(match) === key);
        let fixtures;
        if (target.entry) {
            const replacement = entries.find(entry => drawTeamKey(entry) === drawTeamKey(incoming));
            fixtures = oldFixtures.map(match => {
                const entry_one = drawTeamKey(match.entry_one) === leaving ? replacement : match.entry_one;
                const entry_two = drawTeamKey(match.entry_two) === leaving ? replacement : match.entry_two;
                return { ...match, entry_one, entry_two };
            });
        } else {
            const byPair = new Map(oldFixtures.map(fixture => [pairKey(fixture.entry_one, fixture.entry_two), fixture]));
            fixtures = generateRoundRobinFixtures(entries).map(fixture => {
                const previous = byPair.get(pairKey(fixture.entry_one, fixture.entry_two));
                return {
                    ...fixture, key: `${key}:${fixture.key}`, group_key: key,
                    ...previous,
                    round_code: fixture.round_code, round_label: fixture.round_label,
                    round_number: fixture.round_number, bracket_position: fixture.bracket_position,
                };
            });
        }
        return { ...group, entries, fixtures };
    });
    const affectedFixtures = groups.filter(group => touched.includes(groupKey(group))).flatMap(group => group.fixtures);
    return {
        ...draft, groups, entries: groups.flatMap(group => group.entries),
        matches: [...draft.matches.filter(match => !touched.includes(matchGroup(match))), ...affectedFixtures],
    };
}

export function groupSwapWarnings(before, after, keys, clubsByPlayer = new Map()) {
    const clubsFor = entry => entry.snapshot?.clubs?.length ? entry.snapshot.clubs
        : [entry.player_one_id, entry.player_two_id].map(id => clubsByPlayer.get(String(id))).filter(Boolean);
    const warnings = [];
    const conflicts = (group, isConflict) => {
        const pairs = new Map();
        group.entries.forEach((one, index) => group.entries.slice(index + 1).forEach(two => {
            if (isConflict(one, two)) pairs.set(pairKey(one, two), [one.team_name, two.team_name]);
        }));
        return pairs;
    };
    for (const key of keys) {
        const oldGroup = before.groups.find(group => groupKey(group) === key);
        const group = after.groups.find(item => groupKey(item) === key);
        for (const [label, isConflict] of [
            ['are both top seeds', (one, two) => [one, two].every(entry => entry.seed_number && entry.seed_number <= before.groups.length)],
            ['share a club', (one, two) => clubsFor(one).some(club => clubsFor(two).includes(club))],
        ]) {
            const old = conflicts(oldGroup, isConflict);
            for (const [pair, names] of conflicts(group, isConflict)) {
                if (!old.has(pair)) warnings.push(`${names.join(' and ')} ${label} in ${group.name}.`);
            }
        }
    }
    return warnings;
}

export function describeGroupEdit(source, target) {
    const team = slot => ({
        id: drawTeamKey(slot.entry), registration: slot.entry.source_registration_id,
        name: slot.entry.team_name, group: slot.position,
    });
    return { source: team(source), target: target.entry ? team(target) : { group: target.position } };
}
