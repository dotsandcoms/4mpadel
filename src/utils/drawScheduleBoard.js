export const scheduleDay = (value) => new Date(Date.parse(value) + 2 * 60 * 60_000).toISOString().slice(0, 10);
export const scheduleTimestamp = (day, time) => Date.parse(`${day}T${time.slice(0, 5)}:00+02:00`);
export const scheduleTime = (value) => new Date(Date.parse(value) + 2 * 60 * 60_000).toISOString().slice(11, 16);

export function validateScheduleChanges({ matches, entries, playDays, changes }) {
    const errors = [];
    const entryMap = new Map(entries.map((entry) => [entry.id, entry]));
    const players = (match) => new Set([match.entry_one_id, match.entry_two_id].filter(Boolean).flatMap((id) => {
        const entry = entryMap.get(id);
        return [`entry:${id}`, ...['one', 'two'].flatMap((side) => [
            entry?.[`player_${side}_id`] ? `player:${entry[`player_${side}_id`]}` : null,
            entry?.[`player_${side}_name`]?.trim() ? `name:${entry[`player_${side}_name`].trim().toLowerCase()}` : null,
        ].filter(Boolean))];
    }));
    const combined = matches.map((match) => ({ ...match, ...(changes[match.id] || {}) }));
    for (const [id, change] of Object.entries(changes)) {
        const original = matches.find((match) => match.id === id);
        if (!original || !['pending', 'scheduled'].includes(original.status) || !original.entry_one_id || !original.entry_two_id) {
            errors.push('A selected match is no longer ready to schedule. Reload the board.');
            continue;
        }
        if (!change.scheduled_start && !change.court_name) continue;
        const start = Date.parse(change.scheduled_start);
        const end = Date.parse(change.scheduled_end);
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
            errors.push('Each assignment needs a valid start and end time.');
            continue;
        }
        const day = playDays.find((item) => item.is_active && item.play_date === scheduleDay(change.scheduled_start));
        const courtNumber = Number(/^Court (\d+)$/.exec(change.court_name)?.[1]);
        if (!day || courtNumber < 1 || !Number.isInteger(courtNumber) || courtNumber > Number(day.courts_count)
            || start < scheduleTimestamp(day.play_date, day.start_time) || end > scheduleTimestamp(day.play_date, day.end_time)) {
            errors.push(`${change.court_name}: assignment falls outside the available courts or playing hours.`);
            continue;
        }
        const participantKeys = players(original);
        for (const other of combined) {
            if (other.id === id || other.status === 'cancelled' || !other.scheduled_start) continue;
            const otherStart = Date.parse(other.scheduled_start);
            if (!Number.isFinite(otherStart)) continue;
            const otherDay = playDays.find((item) => item.play_date === scheduleDay(other.scheduled_start));
            const otherEnd = Date.parse(other.scheduled_end) || otherStart + (Number(otherDay?.match_duration_minutes) || 60) * 60_000;
            if (change.court_name === other.court_name && start < otherEnd && end > otherStart) {
                errors.push(`${change.court_name}: two matches overlap at ${scheduleTime(change.scheduled_start)}.`);
            }
            const rest = Math.max(Number(day.minimum_break_minutes) || 0, Number(otherDay?.minimum_break_minutes) || 0) * 60_000;
            if ([...players(other)].some((player) => participantKeys.has(player)) && start < otherEnd + rest && end + rest > otherStart) {
                errors.push(`Player clash or insufficient rest at ${scheduleTime(change.scheduled_start)} (${rest / 60_000} min minimum rest).`);
            }
        }
    }
    return [...new Set(errors)];
}
