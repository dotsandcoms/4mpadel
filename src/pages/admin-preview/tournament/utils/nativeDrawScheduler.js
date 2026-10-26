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

const localTimestamp = (date, time) => new Date(`${date}T${String(time).slice(0, 5)}:00+02:00`).getTime();
const matchEntryIds = (match) => match.possible_player_keys || match.possible_entry_ids || [match.entry_one_id || match.entry_one?.id, match.entry_two_id || match.entry_two?.id].filter(Boolean);

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

    // Search intervals rather than advancing a court past its last booking.
    const bookings = existingMatches.filter(m => m.scheduled_start && m.status !== 'cancelled').map(m => ({...m}));
    const pending = [...matches];
    const updates = [];
    const finished = new Map(existingMatches.map(m => [m.id, m]));
    const terminal = m => ['completed', 'walkover', 'retired', 'cancelled'].includes(m?.status);
    let finalStart = 0;
    while (pending.length) {
        const index = pending.findIndex(m => (!m.align_final || !pending.some(other => !other.align_final)) && (m.dependency_ids || []).every(id => finished.get(id)?.scheduled_end || terminal(finished.get(id))));
        if (index < 0) throw new Error('Schedule the preceding rounds first. A feeder is unscheduled or the draw contains a circular dependency.');
        const [match] = pending.splice(index, 1);
        if (match.align_final && !finalStart) {
            finalStart = Math.max(0, ...bookings.filter(m => !m.align_final).map(m => (Date.parse(m.scheduled_end) || 0) + Math.max(...resources.map(r=>r.breakMs))), bookings.some(m=>m.align_final) ? Math.min(...bookings.filter(m=>m.align_final).map(m=>Date.parse(m.scheduled_start))) : 0);
        }
        const entryIds = new Set(matchEntryIds(match).map(String));
        const notBefore = match.not_before ? Date.parse(match.not_before) : 0;
        if (!Number.isFinite(notBefore)) throw new Error('Enter a valid not-before time.');
        if (match.match_duration_minutes != null && (!Number.isInteger(match.match_duration_minutes) || match.match_duration_minutes < 1)) throw new Error('Match duration must be a positive whole number.');
        const fixedStart = match.scheduled_start ? Date.parse(match.scheduled_start) : null;
        const options = resources.filter(r => (!match.allowed_play_dates || match.allowed_play_dates.includes(r.date)) && (!match.court_name || r.court === match.court_name) && (!match.planned_play_date || r.date === match.planned_play_date)).flatMap(resource => {
            const duration = match.match_duration_minutes ? match.match_duration_minutes * 60000 : resource.duration;
            const dependenciesEnd = Math.max(0, ...(match.dependency_ids || []).map(id => Date.parse(finished.get(id)?.scheduled_end) || 0));
            let start = fixedStart ?? Math.max(resource.next, notBefore, dependenciesEnd ? dependenciesEnd + resource.breakMs : 0, match.align_final ? finalStart : 0);
            if (start < resource.next || start < notBefore || (dependenciesEnd && start < dependenciesEnd + resource.breakMs)) return [];
            for (;;) {
                const clashes = bookings.flatMap(other => {
                    const otherStart = Date.parse(other.scheduled_start);
                    const otherDate = new Date(otherStart + 7200000).toISOString().slice(0,10);
                    const otherDay = activeDays.find(d => d.play_date === otherDate);
                    const otherEnd = Date.parse(other.scheduled_end) || otherStart + (Number(other.match_duration_minutes || otherDay?.match_duration_minutes) || 60) * 60000;
                    const samePlayers = matchEntryIds(other).some(id => entryIds.has(String(id)));
                    const rest = samePlayers ? Math.max(resource.breakMs, (Number(otherDay?.minimum_break_minutes) || 0) * 60000) : 0;
                    return (other.court_name === resource.court || samePlayers) && start < otherEnd + rest && start + duration + rest > otherStart ? [otherEnd + rest] : [];
                });
                if (!clashes.length) break;
                if (fixedStart != null) return [];
                start = Math.max(...clashes);
            }
            return start + duration <= resource.end ? [{resource,start,finish:start+duration}] : [];
        }).sort((a,b) => a.start-b.start || a.resource.court.localeCompare(b.resource.court));
        const selected = options[0];
        if (!selected) throw new Error(`Not enough court time for ${match.round_label || 'this match'}. Extend the play day or change its round plan.`);
        if (match.align_final && !finalStart) finalStart = selected.start;
        const update = {id:match.id,court_name:selected.resource.court,scheduled_start:new Date(selected.start).toISOString(),scheduled_end:new Date(selected.finish).toISOString()};
        const booked = {...match,...update};
        bookings.push(booked); finished.set(match.id,booked); updates.push(update);
    }
    return updates;
};

export const mergeEventPlayDays = (defaults, saved) => {
    const byDate = new Map(defaults.map(day => [day.play_date, day]));
    saved.forEach(day => byDate.set(day.play_date, { ...byDate.get(day.play_date), ...day }));
    return [...byDate.values()].filter(day => !day.is_removed).sort((a, b) => a.play_date.localeCompare(b.play_date));
};

export const addEventPlayDay = (days, date, event) => {
    const parsed = new Date(`${date}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
        throw new Error('Choose a valid play date.');
    }
    if (days.some(day => day.play_date === date)) throw new Error('That play day is already included.');
    const source = days.at(-1) || buildEventPlayDays({ ...event, start_date: date, end_date: date })[0];
    const { id: _id, ...settings } = source;
    return [...days, { ...settings, play_date: date, is_active: true, is_removed: false }].sort((a, b) => a.play_date.localeCompare(b.play_date));
};
