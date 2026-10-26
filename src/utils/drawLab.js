import { generateGroupStageDraft, generateKnockoutDraft } from './nativeDrawGenerator.js';
import { calculateGroupStandings } from './nativeDrawStandings.js';

const FIRST_NAMES = [
    'Aiden', 'Amahle', 'Ben', 'Carmen', 'Dani', 'Ethan', 'Faith', 'Gareth',
    'Hannah', 'Imani', 'Jaco', 'Kayla', 'Liam', 'Mia', 'Noah', 'Olivia',
    'Pieter', 'Qhawe', 'Rene', 'Sarah', 'Thabo', 'Uma', 'Victor', 'Wendy',
    'Xander', 'Yara', 'Zane', 'Bianca', 'Chris', 'Dineo', 'Emile', 'Farah',
];

const LAST_NAMES = [
    'Adams', 'Botha', 'Cele', 'Daniels', 'Erasmus', 'Fourie', 'Govender', 'Hendricks',
    'Isaacs', 'Jacobs', 'Khumalo', 'Le Roux', 'Mokoena', 'Naidoo', 'Olivier', 'Pillay',
    'Quinn', 'Rossouw', 'Smith', 'Theron', 'Uys', 'Van Wyk', 'Williams', 'Xaba',
    'Young', 'Zulu', 'Bester', 'Coetzee', 'Du Plessis', 'Engelbrecht', 'Fouché', 'Grobler',
];

export const LAB_STORAGE_KEY = '4m-padel:draw-lab:v2';

export const DEFAULT_LAB_CONFIG = {
    playerCount: 64,
    format: 'knockout',
    groupCount: 8,
    advancersPerGroup: 2,
    seededPercentage: 100,
    placementPlayoff: 'none',
    courtCount: 3,
    firstDay: '2026-09-11',
    startTime: '08:00',
    endTime: '18:00',
    matchDuration: 60,
};

export function createFakePlayers(count = 64) {
    return Array.from({ length: count }, (_, index) => {
        const first = FIRST_NAMES[index % FIRST_NAMES.length];
        // Offset the surname each time the first-name list wraps so a 64-player
        // lab never displays two different fake records as the same person.
        const nameCycle = Math.floor(index / FIRST_NAMES.length);
        const surname = LAST_NAMES[((index * 7) + nameCycle) % LAST_NAMES.length];
        return {
            id: `lab-player-${index + 1}`,
            name: `${first} ${surname}`,
            points: Math.max(0, 3200 - (index * 47) - ((index % 5) * 13)),
        };
    });
}

export function pairFakePlayers(players) {
    const teams = [];
    for (let index = 0; index < players.length - 1; index += 2) {
        const one = players[index];
        const two = players[index + 1];
        teams.push({
            id: `lab-team-${(index / 2) + 1}`,
            team_name: `${one.name} / ${two.name}`,
            player_one_id: one.id,
            player_two_id: two.id,
            player_one_name: one.name,
            player_two_name: two.name,
            player_one_points: one.points,
            player_two_points: two.points,
            seeding_value: one.points + two.points,
            seed_number: (index / 2) + 1,
            status: 'active',
        });
    }
    return teams;
}

function linkKnockoutMatches(matches) {
    const destinationBySource = new Map();
    matches.forEach((match) => {
        (match.source_slots || []).forEach((slot, slotIndex) => {
            if (slot.source_match_key) {
                destinationBySource.set(`${slot.type || 'match'}:${slot.source_match_key}`, {
                    matchKey: match.key,
                    slot: slotIndex + 1,
                });
            }
        });
    });

    return matches.map((match) => ({
        ...match,
        id: match.key,
        entry_one_id: match.entry_one?.id || null,
        entry_two_id: match.entry_two?.id || null,
        winner_entry_id: match.winner?.id || null,
        loser_entry_id: null,
        winner_to_match_key: destinationBySource.get(`match:${match.key}`)?.matchKey || null,
        winner_to_slot: destinationBySource.get(`match:${match.key}`)?.slot || null,
        loser_to_match_key: destinationBySource.get(`loser:${match.key}`)?.matchKey || null,
        loser_to_slot: destinationBySource.get(`loser:${match.key}`)?.slot || null,
        sets: [],
    }));
}

export function buildLabDraft(entries, config = DEFAULT_LAB_CONFIG) {
    if (config.format === 'knockout') {
        const knockout = generateKnockoutDraft(entries, {
            seedingMethod: 'manual',
            seededPercentage: Number(config.seededPercentage),
            placementPlayoff: config.placementPlayoff,
        });
        return { ...knockout, format: 'knockout', groups: [], matches: linkKnockoutMatches(knockout.matches) };
    }

    const draft = generateGroupStageDraft(entries, {
        format: config.format,
        groupCount: Number(config.groupCount),
        seedingMethod: 'manual',
        seededPercentage: Number(config.seededPercentage),
    });
    const groupIdByEntry = new Map();
    draft.groups.forEach((group) => group.entries.forEach((entry) => groupIdByEntry.set(entry.id, group.key)));
    const normalisedEntries = draft.entries.map((entry) => ({
        ...entry,
        draw_id: 'local-draw-lab',
        group_id: groupIdByEntry.get(entry.id),
    }));
    const entryById = new Map(normalisedEntries.map((entry) => [entry.id, entry]));
    const matches = draft.matches.map((match) => ({
        ...match,
        id: `${match.group_key}-${match.key}`,
        key: `${match.group_key}-${match.key}`,
        group_id: match.group_key,
        entry_one: entryById.get(match.entry_one.id),
        entry_two: entryById.get(match.entry_two.id),
        entry_one_id: match.entry_one.id,
        entry_two_id: match.entry_two.id,
        winner_entry_id: null,
        loser_entry_id: null,
        sets: [],
    }));
    return {
        ...draft,
        entries: normalisedEntries,
        groups: draft.groups.map((group) => ({
            ...group,
            id: group.key,
            entries: group.entries.map((entry) => entryById.get(entry.id)),
        })),
        matches,
    };
}

function sourceEntry(slot, matchesByKey) {
    if (slot.type === 'entry') return slot.entry || null;
    const source = matchesByKey.get(slot.source_match_key);
    if (!source) return null;
    if (slot.type === 'loser') {
        return source.loser_entry_id
            ? [source.entry_one, source.entry_two].find((entry) => entry?.id === source.loser_entry_id) || null
            : null;
    }
    return source.winner_entry_id
        ? [source.entry_one, source.entry_two, source.winner].find((entry) => entry?.id === source.winner_entry_id) || null
        : source.winner || null;
}

export function recordLabResult(draft, matchKey, winnerId, scores = [[6, 4], [6, 3]]) {
    let matches = draft.matches.map((match) => {
        if (match.key !== matchKey) return { ...match };
        const winner = [match.entry_one, match.entry_two].find((entry) => entry?.id === winnerId);
        if (!winner) throw new Error('Select a team in this match');
        const loser = match.entry_one.id === winner.id ? match.entry_two : match.entry_one;
        return {
            ...match,
            status: 'completed',
            result_type: 'played',
            winner,
            winner_entry_id: winner.id,
            loser_entry_id: loser.id,
            sets: scores.map(([one, two], index) => ({
                id: `${match.key}-set-${index + 1}`,
                match_id: match.key,
                set_number: index + 1,
                entry_one_games: match.entry_one.id === winner.id ? one : two,
                entry_two_games: match.entry_two.id === winner.id ? one : two,
            })),
        };
    });

    if (draft.format === 'knockout' || matches.some((match) => match.stage === 'knockout')) {
        for (let pass = 0; pass < matches.length; pass += 1) {
            const matchesByKey = new Map(matches.map((match) => [match.key, match]));
            matches = matches.map((match) => {
                if (!match.source_slots?.some((slot) => slot.source_match_key)) return match;
                const nextOne = sourceEntry(match.source_slots[0], matchesByKey);
                const nextTwo = sourceEntry(match.source_slots[1], matchesByKey);
                const entrantsChanged = match.entry_one?.id !== nextOne?.id || match.entry_two?.id !== nextTwo?.id;
                let next = {
                    ...match,
                    entry_one: nextOne,
                    entry_two: nextTwo,
                    entry_one_id: nextOne?.id || null,
                    entry_two_id: nextTwo?.id || null,
                };
                if (entrantsChanged && match.status === 'completed') {
                    next = { ...next, status: 'pending', winner: null, winner_entry_id: null, loser_entry_id: null, sets: [] };
                }
                if (nextOne && !nextTwo && match.stage !== 'placement') {
                    next = { ...next, status: 'completed', result_type: 'walkover', winner: nextOne, winner_entry_id: nextOne.id };
                } else if (!nextOne && nextTwo && match.stage !== 'placement') {
                    next = { ...next, status: 'completed', result_type: 'walkover', winner: nextTwo, winner_entry_id: nextTwo.id };
                }
                return next;
            });
        }
    }
    return { ...draft, matches };
}

export function getLabStandings(draft, groupId) {
    const matches = draft.matches.filter((match) => match.group_id === groupId);
    return calculateGroupStandings({
        entries: draft.entries,
        matches,
        matchSets: matches.flatMap((match) => match.sets || []),
        groupId,
    });
}

export function addLabElimination(draft, config) {
    const advancers = Array.from({ length: Number(config.advancersPerGroup) }, (_, index) => index)
        .flatMap((position) => draft.groups.map((group) => {
            const standing = getLabStandings(draft, group.id)[position];
            return standing ? draft.entries.find((entry) => entry.id === standing.entry_id) : null;
        }).filter(Boolean))
        .map((entry, index) => ({ ...entry, group_id: null, group_key: null, seed_number: index + 1 }));
    if (advancers.length < 2) throw new Error('At least two teams must advance');
    const knockout = generateKnockoutDraft(advancers, {
        seedingMethod: 'manual',
        placementPlayoff: config.placementPlayoff,
    });
    return {
        ...draft,
        matches: [...draft.matches, ...linkKnockoutMatches(knockout.matches)],
        eliminationCreated: true,
    };
}

export function areAllGroupsComplete(draft) {
    const groupMatches = draft.matches.filter((match) => match.stage === 'group');
    return groupMatches.length > 0 && groupMatches.every((match) => match.status === 'completed');
}

export function simulateAllPlayable(draft) {
    let next = draft;
    let changed = true;
    while (changed) {
        changed = false;
        const playable = next.matches.find((match) => match.status === 'pending' && match.entry_one && match.entry_two);
        if (playable) {
            const winner = playable.round_number % 2 === 0 ? playable.entry_two : playable.entry_one;
            next = recordLabResult(next, playable.key, winner.id);
            changed = true;
        }
    }
    return next;
}

export function scheduleLabMatches(draft, config) {
    const courts = Math.max(1, Number(config.courtCount) || 1);
    const duration = Math.max(15, Number(config.matchDuration) || 60);
    const [startHour, startMinute] = config.startTime.split(':').map(Number);
    const [endHour, endMinute] = config.endTime.split(':').map(Number);
    const dayStart = new Date(`${config.firstDay}T00:00:00`);
    let slot = 0;
    let dayOffset = 0;
    return {
        ...draft,
        matches: draft.matches.map((match) => {
            const currentDay = new Date(dayStart);
            const minutesPerDay = ((endHour * 60) + endMinute) - ((startHour * 60) + startMinute);
            const slotsPerCourt = Math.max(1, Math.floor(minutesPerDay / duration));
            const slotsPerDay = slotsPerCourt * courts;
            dayOffset = Math.floor(slot / slotsPerDay);
            const daySlot = slot % slotsPerDay;
            const court = (daySlot % courts) + 1;
            const timeIndex = Math.floor(daySlot / courts);
            currentDay.setDate(currentDay.getDate() + dayOffset);
            currentDay.setHours(startHour, startMinute + (timeIndex * duration), 0, 0);
            slot += 1;
            return { ...match, court_name: `Court ${court}`, scheduled_start: currentDay.toISOString() };
        }),
    };
}
