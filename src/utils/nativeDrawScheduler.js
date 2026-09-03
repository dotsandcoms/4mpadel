const dateOnly = (value) => String(value || '').slice(0, 10);
const timeOnly = (value, fallback) => String(value || fallback).slice(0, 5);

const addUtcDays = (date, amount) => {
    const next = new Date(`${date}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + amount);
    return next.toISOString().slice(0, 10);
};

export const buildEventPlayDays = (event) => {
    const start = dateOnly(event?.start_date);
    const end = dateOnly(event?.end_date) || start;
    if (!start) return [];
    const last = end >= start ? end : start;
    const days = [];
    for (let date = start; date <= last; date = addUtcDays(date, 1)) {
        days.push({
            play_date: date,
            start_time: timeOnly(event?.start_time, '08:00'),
            end_time: timeOnly(event?.end_time, '18:00'),
            courts_count: Math.max(1, Number(event?.courts_count) || 1),
            match_duration_minutes: 60,
            minimum_break_minutes: 10,
            is_active: true,
        });
    }
    return days;
};

const localTimestamp = (date, time) => new Date(`${date}T${time}:00`).getTime();
const matchEntryIds = (match) => [match.entry_one_id || match.entry_one?.id, match.entry_two_id || match.entry_two?.id].filter(Boolean);

export const scheduleMatchesAcrossPlayDays = ({ matches, playDays, existingMatches = [] }) => {
    const activeDays = [...playDays]
        .filter((day) => day.is_active)
        .sort((a, b) => a.play_date.localeCompare(b.play_date));
    if (activeDays.length === 0) throw new Error('Select at least one play day');

    const resources = activeDays.flatMap((day) => {
        const start = localTimestamp(day.play_date, day.start_time);
        const end = localTimestamp(day.play_date, day.end_time);
        const duration = Number(day.match_duration_minutes) * 60_000;
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error(`Check the playing times for ${day.play_date}`);
        if (!Number.isFinite(duration) || duration <= 0) throw new Error(`Check the match duration for ${day.play_date}`);
        return Array.from({ length: Number(day.courts_count) }, (_, index) => ({
            date: day.play_date,
            court: `Court ${index + 1}`,
            next: start,
            end,
            duration,
            breakMs: Math.max(0, Number(day.minimum_break_minutes) || 0) * 60_000,
        }));
    });
    if (resources.length === 0) throw new Error('Add at least one available court');

    const playerAvailable = new Map();
    existingMatches.filter((match) => match.court_name && match.scheduled_start).forEach((match) => {
        const start = new Date(match.scheduled_start).getTime();
        if (!Number.isFinite(start)) return;
        const date = dateOnly(match.scheduled_start);
        const resource = resources.find((item) => item.date === date && item.court === match.court_name);
        if (!resource) return;
        const scheduledEnd = match.scheduled_end ? new Date(match.scheduled_end).getTime() : start + resource.duration;
        resource.next = Math.max(resource.next, scheduledEnd);
        matchEntryIds(match).forEach((entryId) => playerAvailable.set(String(entryId), Math.max(playerAvailable.get(String(entryId)) || 0, scheduledEnd + resource.breakMs)));
    });

    return matches.map((match) => {
        const entryIds = matchEntryIds(match).map(String);
        const fixedStart = match.scheduled_start ? new Date(match.scheduled_start).getTime() : null;
        const fixedDate = fixedStart ? dateOnly(match.scheduled_start) : null;
        const options = resources
            .filter((resource) => (!match.court_name || resource.court === match.court_name) && (!fixedDate || resource.date === fixedDate))
            .map((resource) => {
                const restReady = entryIds.reduce((latest, entryId) => Math.max(latest, playerAvailable.get(entryId) || 0), 0);
                const start = fixedStart || Math.max(resource.next, restReady);
                const fixedStartIsAvailable = !fixedStart || (start >= resource.next && start >= restReady);
                return { resource, start, finish: start + resource.duration, fixedStartIsAvailable };
            })
            .filter((option) => option.fixedStartIsAvailable && option.finish <= option.resource.end)
            .sort((a, b) => a.start - b.start || a.resource.court.localeCompare(b.resource.court));
        const selected = options[0];
        if (!selected) throw new Error(`Not enough court time to schedule ${match.team_name || match.round_label || 'every ready match'}`);
        selected.resource.next = Math.max(selected.resource.next, selected.finish);
        entryIds.forEach((entryId) => playerAvailable.set(entryId, selected.finish + selected.resource.breakMs));
        return {
            id: match.id,
            court_name: match.court_name || selected.resource.court,
            scheduled_start: match.scheduled_start || new Date(selected.start).toISOString(),
            scheduled_end: new Date(selected.finish).toISOString(),
        };
    });
};
