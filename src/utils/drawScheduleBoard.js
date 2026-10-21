import {planningMatches} from './drawPlanning.js';
import { createDailyRoundCounter, createSchedulePlayerOverlap, dailyRoundLimit, schedulePlayerKeys } from './divisionSchedulePlan.js';
export const scheduleDay = (value) => new Date(Date.parse(value) + 2 * 60 * 60_000).toISOString().slice(0, 10);
export const scheduleTimestamp = (day, time) => Date.parse(`${day}T${time.slice(0, 5)}:00+02:00`);
export const scheduleTime = (value) => new Date(Date.parse(value) + 2 * 60 * 60_000).toISOString().slice(11, 16);

export const scheduleDateLabel = (day) => new Intl.DateTimeFormat('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Johannesburg',
}).format(new Date(`${day}T12:00:00+02:00`));

export function validateScheduleChanges({ matches, entries, playDays, changes, divisions = [], previousMatches = [], divisionConfigs = {} }) {
    matches = planningMatches(matches);
    const errors = [];
    const entryMap = new Map(entries.map((entry) => [entry.id, entry]));
    const describe = (match) => {
        if (!match) return 'Unknown match';
        const division = divisions.find(d => d.id === match.draws?.division_id)?.name;
        const teams = [match.entry_one_id, match.entry_two_id].map(id => entryMap.get(id)?.team_name);
        return [division, match.round_label, `Match ${match.bracket_position ?? match.id}`,
            teams.every(Boolean) ? teams.join(' vs ') : null].filter(Boolean).join(' · ');
    };
    const combined = matches.map((match) => ({ ...match, ...(changes[match.id] || {}) }));
    const withPlayers = combined.map(match => ({ ...match, possible_player_keys: schedulePlayerKeys(match, entryMap) }));
    const sharePlayer = createSchedulePlayerOverlap(withPlayers);
    for (const [id, values] of Object.entries(changes)) {
        const change = { ...matches.find(match => match.id === id), ...values };
        const original = matches.find((match) => match.id === id);
        const name = describe(original || previousMatches.find(match => match.id === id) || {id});
        if (!original) {
            errors.push(`${name}: this match no longer exists in the current draw, which may have been replaced. Discard the preview and reload the board.`);
            continue;
        }
        if (!['pending', 'scheduled'].includes(original.status)) {
            const reason = {in_progress:'already in progress',completed:'already completed',walkover:'recorded as a walkover',retired:'recorded as a retirement',cancelled:'cancelled',bye:'a bye — no court time is needed'}[original.status] || `marked ${original.status}`;
            errors.push(`${name}: ${reason}. It cannot be rescheduled. Discard the preview and review this match in Results.`);
            continue;
        }
        if (!original.can_plan) {
            if (['knockout', 'placement'].includes(original.stage) && (original.is_automatic_bye || original.is_empty_path)) {
                errors.push(`${name}: ${original.is_automatic_bye ? 'an automatic BYE advance' : 'an empty branch'} needs no court booking. Schedule the next played match instead.`);
                continue;
            }
            const missing = [1,2].filter(slot => !original[slot === 1 ? 'entry_one_id' : 'entry_two_id'] && !matches.some(m =>
                m.winner_to_match_id === id && m.winner_to_slot === slot || m.loser_to_match_id === id && m.loser_to_slot === slot));
            errors.push(`${name}: team slot ${missing.join(' and ')} has neither an entrant nor a linked earlier match. Review the draw to fill the place or resolve it as a bye before scheduling.`);
            continue;
        }
        if (change.match_duration_minutes != null && (!Number.isInteger(change.match_duration_minutes) || change.match_duration_minutes < 1)) errors.push(`${name}: match duration must be a positive whole number.`);
        if (change.not_before && !Number.isFinite(Date.parse(change.not_before))) errors.push(`${name}: enter a valid not-before date and time.`);
        if (!change.scheduled_start) continue;
        if (change.not_before && Date.parse(change.scheduled_start) < Date.parse(change.not_before)) errors.push(`${name}: match cannot start before ${scheduleDateLabel(scheduleDay(change.not_before))} at ${scheduleTime(change.not_before)}.`);
        const start = Date.parse(change.scheduled_start);
        const end = Date.parse(change.scheduled_end);
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
            errors.push(`${name}: assignment needs a valid start and end time.`);
            continue;
        }
        const day = playDays.find((item) => item.is_active && item.play_date === scheduleDay(change.scheduled_start));
        const courtNumber = Number(/^Court (\d+)$/.exec(change.court_name)?.[1]);
        if (!day || courtNumber < 1 || !Number.isInteger(courtNumber) || courtNumber > Number(day.courts_count)
            || start < scheduleTimestamp(day.play_date, day.start_time) || end > scheduleTimestamp(day.play_date, day.end_time)) {
            errors.push(`${name}: ${change.court_name || "No court selected"} on ${scheduleDateLabel(scheduleDay(change.scheduled_start))} at ${scheduleTime(change.scheduled_start)}–${scheduleTime(change.scheduled_end)} falls outside the available courts or playing hours.${day ? ` Available: Courts 1–${day.courts_count}, ${day.start_time.slice(0,5)}–${day.end_time.slice(0,5)}.` : " This date is not an active play day."}`);
            continue;
        }
        const config = divisionConfigs[original.draws?.division_id];
        if (config?.play_dates && !config.play_dates.includes(day.play_date)) errors.push(`${name}: this division does not play on ${day.play_date}.`);
        const divisionStart = config?.schedule_days?.[day.play_date]?.start_time;
        if (divisionStart && start < scheduleTimestamp(day.play_date, divisionStart)) errors.push(`${name}: this division starts from ${divisionStart} on ${day.play_date}.`);
        for (const other of combined) {
            if (other.id === id || other.status === 'cancelled' || !other.scheduled_start) continue;
            const otherStart = Date.parse(other.scheduled_start);
            if (!Number.isFinite(otherStart)) continue;
            const otherDay = playDays.find((item) => item.play_date === scheduleDay(other.scheduled_start));
            const otherEnd = Date.parse(other.scheduled_end) || otherStart + (Number(otherDay?.match_duration_minutes) || 60) * 60_000;
            if (change.court_name === other.court_name && start < otherEnd && end > otherStart) {
                errors.push(`${name} and ${describe(other)}: two matches overlap on ${change.court_name}, ${scheduleDateLabel(scheduleDay(change.scheduled_start))} at ${scheduleTime(change.scheduled_start)}–${scheduleTime(change.scheduled_end)} (other match: ${scheduleTime(other.scheduled_start)}–${scheduleTime(new Date(otherEnd).toISOString())}). Move one to a free court or time.`);
            }
            const rest = Math.max(Number(day.minimum_break_minutes) || 0, Number(otherDay?.minimum_break_minutes) || 0) * 60_000;
            if (sharePlayer(original, other) && start < otherEnd + rest && end + rest > otherStart) {
                errors.push(`${name} and ${describe(other)}: Player clash or insufficient rest on ${scheduleDateLabel(scheduleDay(change.scheduled_start))} at ${scheduleTime(change.scheduled_start)} (other match: ${scheduleTime(other.scheduled_start)}–${scheduleTime(new Date(otherEnd).toISOString())}; ${rest / 60_000} min minimum rest). These matches share a player or a possible advancing team. Leave the required gap between them.`);
            }
        }
    }
    for (const match of combined) {
        if (!match.scheduled_start || match.status === 'cancelled') continue;
        for (const id of match.dependency_ids || []) {
            if (!changes[match.id] && !changes[id]) continue;
            const feeder=combined.find(m=>m.id===id);
            if (!feeder || feeder.is_automatic_bye || feeder.is_empty_path || ['completed','walkover','retired','cancelled'].includes(feeder.status)) continue;
            const day=playDays.find(d=>d.play_date===scheduleDay(match.scheduled_start));
            const rest=(Number(day?.minimum_break_minutes)||0)*60000;
            if (!feeder.scheduled_end || Date.parse(match.scheduled_start)<Date.parse(feeder.scheduled_end)+rest) errors.push(`${describe(match)}: ${describe(feeder)} must finish first. ${feeder.scheduled_end ? `Earliest start after ${rest / 60000} min rest: ${scheduleDateLabel(scheduleDay(new Date(Date.parse(feeder.scheduled_end)+rest).toISOString()))} at ${scheduleTime(new Date(Date.parse(feeder.scheduled_end)+rest).toISOString())}.` : 'The earlier match has no finish time yet; schedule it first.'}`);
        }
    }
    const dailyRounds = createDailyRoundCounter(withPlayers);
    for (const division of divisions) for (const day of playDays.filter(day => day.is_active)) {
        const limit = dailyRoundLimit(divisionConfigs[division.id], day.play_date);
        if (!Number.isFinite(limit) || !combined.some(match => changes[match.id] && match.draws?.division_id === division.id)) continue;
        const count = dailyRounds(withPlayers, day.play_date, division.id);
        if (count > limit) errors.push(`${division.name}: a player could play ${count} rounds on ${scheduleDateLabel(day.play_date)}; the daily limit is ${limit}. Move a match to another day or update the division plan.`);
    }
    return [...new Set(errors)];
}
