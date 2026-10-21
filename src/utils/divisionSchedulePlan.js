const divisionId = match => match.draws?.division_id ?? match.division_id;
const participantKeys = match => match.possible_player_keys || match.possible_entry_ids || [match.entry_one_id || match.entry_one?.id, match.entry_two_id || match.entry_two?.id].filter(Boolean);
export const scheduleDivisionId = divisionId;

export function orderedScheduleDivisions(divisions, configs) {
    return divisions.map((division, index) => ({ ...division, index }))
        .sort((a, b) => (configs[a.id]?.schedule_priority ?? a.index) - (configs[b.id]?.schedule_priority ?? b.index));
}

export function validateDivisionSchedulePlan(configs, divisions, playDays) {
    for (const division of divisions) for (const day of playDays.filter(day => day.is_active)) {
        if (configs[division.id]?.play_dates && !configs[division.id].play_dates.includes(day.play_date)) continue;
        const plan = configs[division.id]?.schedule_days?.[day.play_date];
        if (!plan) continue;
        if (plan.rounds !== '' && plan.rounds != null && (!Number.isInteger(Number(plan.rounds)) || Number(plan.rounds) < 0 || Number(plan.rounds) > 99)) {
            throw new Error(`${division.name}: rounds per day must be a whole number from 0 to 99, or Max.`);
        }
        if (plan.start_time && (!/^([01]\d|2[0-3]):[0-5]\d$/.test(plan.start_time) || plan.start_time < day.start_time.slice(0, 5) || plan.start_time >= day.end_time.slice(0, 5))) {
            throw new Error(`${division.name}: choose a start time inside the playing hours for ${day.play_date}.`);
        }
    }
}

export function schedulePlayerKeys(match, entryMap) {
    return [...new Set((match.possible_entry_ids || [match.entry_one_id, match.entry_two_id]).filter(Boolean).flatMap(id => {
        const entry = entryMap.get(id);
        return [`entry:${id}`, ...['one', 'two'].flatMap(side => [
            entry?.[`player_${side}_id`] ? `player:${entry[`player_${side}_id`]}` : null,
            entry?.[`player_${side}_name`]?.trim() ? `name:${entry[`player_${side}_name`].trim().toLowerCase()}` : null,
        ].filter(Boolean))];
    }))];
}

export function createSchedulePlayerOverlap(matches) {
    const byId = new Map(matches.map(match => [match.id, match]));
    const incoming = new Map(matches.map(match => [match.id, []]));
    for (const match of matches) for (const result of ['winner', 'loser']) {
        const target = match[`${result}_to_match_id`];
        if (incoming.has(target)) incoming.get(target).push({ id: match.id, result });
    }
    const memo = new Map();
    const routes = (id, seen = new Set()) => {
        if (memo.has(id)) return memo.get(id);
        if (seen.has(id)) throw new Error('The draw contains a circular route.');
        const match = byId.get(id);
        const paths = new Map();
        for (const key of participantKeys(match)) {
            const alternatives = incoming.get(id).flatMap(parent => (routes(parent.id, new Set([...seen, id])).get(String(key)) || [])
                .map(path => new Map([...path, [parent.id, parent.result]])));
            paths.set(String(key), alternatives.length ? alternatives : [new Map()]);
        }
        memo.set(id, paths);
        return paths;
    };
    return (one, two) => {
        const a = routes(one.id), b = routes(two.id);
        for (const [key, alternatives] of a) {
            if (b.has(key) && alternatives.some(path => b.get(key).some(other => [...path].every(([id, result]) => !other.has(id) || other.get(id) === result)))) return true;
        }
        return false;
    };
}

// A player takes one route through a knockout and its plates. Count the longest
// possible route, rather than adding mutually exclusive winner/loser branches.
// Independent fixtures (including round robins) contribute separate appearances.
export function createDailyRoundCounter(matches) {
    const byId = new Map(matches.map(match => [match.id, match]));
    const parents = new Map(matches.map(match => [match.id, []]));
    const adjacent = new Map(matches.map(match => [match.id, []]));
    for (const match of matches) for (const result of ['winner', 'loser']) {
        const target = match[`${result}_to_match_id`];
        if (!byId.has(target)) continue;
        parents.get(target).push(match.id);
        adjacent.get(target).push(match.id);
        adjacent.get(match.id).push(target);
    }
    const components = new Map();
    for (const match of matches) {
        const visit = [match.id];
        while (visit.length) {
            const id = visit.pop();
            if (components.has(id)) continue;
            components.set(id, match.id);
            visit.push(...adjacent.get(id));
        }
    }
    return (bookings, date, targetDivision) => {
        const booked = new Map(bookings.map(match => [match.id, match]));
        const memo = new Map();
        const paths = (id, seen = new Set()) => {
            if (memo.has(id)) return memo.get(id);
            if (seen.has(id)) throw new Error('The draw contains a circular route.');
            const match = booked.get(id) || byId.get(id);
            const keys = new Set(participantKeys(match));
            const counts = new Map([...keys].map(key => [String(key), 0]));
            for (const parent of parents.get(id)) for (const [key, count] of paths(parent, new Set([...seen, id]))) {
                if (counts.has(key)) counts.set(key, Math.max(counts.get(key), count));
            }
            const start = Date.parse(match.scheduled_start);
            const automaticBye = match.result_type === 'walkover' && Boolean(match.entry_one_id) !== Boolean(match.entry_two_id);
            const plays = !match.is_automatic_bye && !match.is_empty_path && Number.isFinite(start) && new Date(start + 7200000).toISOString().slice(0, 10) === date
                && !['cancelled', 'walkover', 'bye'].includes(match.status) && !automaticBye;
            if (plays) for (const key of counts.keys()) counts.set(key, counts.get(key) + 1);
            memo.set(id, counts);
            return counts;
        };
        const totals = new Map();
        for (const match of matches.filter(match => divisionId(match) === targetDivision)) {
            for (const [key, count] of paths(match.id)) {
                const groups = totals.get(key) || new Map();
                groups.set(components.get(match.id), Math.max(groups.get(components.get(match.id)) || 0, count));
                totals.set(key, groups);
            }
        }
        return Math.max(0, ...[...totals.values()].map(groups => [...groups.values()].reduce((a, b) => a + b, 0)));
    };
}

export function dailyRoundLimit(config, date) {
    const rounds = config?.schedule_days?.[date]?.rounds;
    return rounds === '' || rounds == null ? Infinity : Number(rounds);
}
