import { planningMatches } from '../drawPlanning.js';
import { generateKnockoutDraft } from '../nativeDrawGenerator.js';
import { RESOLVED, tournamentWorkflow, defaultSettings, activeDivisions } from './workflow.js';

const minute = 60000;
export const localStamp = (date, time) => Date.parse(`${date}T${String(time).slice(0, 5)}:00+02:00`);
export const localDay = stamp => new Date(Date.parse(stamp) + 120 * minute).toISOString().slice(0, 10);
export const localTime = stamp => new Date(Date.parse(stamp) + 120 * minute).toISOString().slice(11, 16);
const iso = ms => new Date(ms).toISOString();
const intersect = (a, b) => a.some(key => b.includes(key));

export function participantKeys(entry) {
    if (!entry) return [];
    return ['one', 'two'].flatMap(side => {
        const email = entry.snapshot?.[side === 'one' ? 'registration_email' : 'partner_email'];
        return [entry[`player_${side}_id`] && `player:${entry[`player_${side}_id`]}`,
            email && `email:${email.trim().toLowerCase()}`,
            !entry[`player_${side}_id`] && !email && entry[`player_${side}_name`] && `name:${entry[`player_${side}_name`].trim().toLowerCase()}`].filter(Boolean);
    });
}

/** One scheduling representation for fixed pairs, rotating pairs and future qualifiers. */
export function tournamentFixtures({ draws = [], matches = [], entries = [], divisions, registrations = [] }) {
    if (divisions) draws = draws.filter(d => activeDivisions(divisions).some(v => v.id === d.division_id) && d.status !== 'archived');
    matches = matches.filter(m => draws.some(d => d.id === m.draw_id));
    const drawMap = new Map(draws.map(d => [d.id, d]));
    const entryMap = new Map(entries.map(e => [e.id, e]));
    let fixtures = planningMatches(matches).map(m => {
        const draw = drawMap.get(m.draw_id);
        return { ...m, division_id: draw?.division_id, format: draw?.format,
            players: [...new Set((m.possible_entry_ids || []).flatMap(id => participantKeys(entryMap.get(id))))],
            label: [entryMap.get(m.entry_one_id)?.team_name, entryMap.get(m.entry_two_id)?.team_name].filter(Boolean).join(' vs ') || m.round_label,
            final: draw?.draw_kind === 'main' && m.stage === 'knockout' && !m.winner_to_match_id,
        };
    });
    for (const draw of draws) {
        const rotation = draw.scoring_rules?.americano;
        if (rotation) {
            const players = new Map(rotation.players.map(p => [p.id, p]));
            const previousWaves = new Map();
            for (const f of rotation.fixtures) {
                const wave = f.round * 10000 + f.wave;
                if (!previousWaves.has(wave)) previousWaves.set(wave, []);
                previousWaves.get(wave).push(f.id);
            }
            const waves = [...previousWaves.keys()].sort((a, b) => a - b);
            fixtures = fixtures.filter(m => m.draw_id !== draw.id);
            for (const f of rotation.fixtures) {
                const saved = matches.find(m => m.draw_id === draw.id && m.americano_fixture_key === f.id);
                const ids = [...f.one, ...f.two];
                fixtures.push({ ...saved, id: saved?.id || `${draw.id}:americano:${f.id}`, draw_id: draw.id, division_id: draw.division_id,
                    americano_fixture_key: f.id, format: 'americano', final: false, can_plan: true,
                    status: f.score ? 'completed' : saved?.status || 'pending', round_number: f.round, round_label: `Round ${f.round}`, bracket_position: f.wave,
                    court_name: saved?.court_name || `Court ${f.court}`, scheduled_start: saved?.scheduled_start || f.scheduled_start,
                    scheduled_end: saved?.scheduled_end || f.scheduled_end,
                    players: ids.flatMap(id => { const p = players.get(id); const registration = registrations.find(r => String(r.id) === String(id).replace(':partner', '')); const email = p?.email || (String(id).endsWith(':partner') ? registration?.partner_email : registration?.email); return [email ? `email:${email.trim().toLowerCase()}` : `name:${p?.name?.trim().toLowerCase() || id}`]; }),
                    label: [f.one, f.two].map(side => side.map(id => players.get(id)?.name || 'Player').join(' / ')).join(' vs '),
                    dependency_ids: (previousWaves.get(waves[waves.indexOf(f.round * 10000 + f.wave) - 1]) || []).map(id => matches.find(m => m.draw_id === draw.id && m.americano_fixture_key === id)?.id || `${draw.id}:americano:${id}`),
                });
            }
        }
        if (draw.format === 'group_knockout' && !fixtures.some(m => m.draw_id === draw.id && m.stage === 'knockout')) {
            const count = Number(draw.group_count) * Number(draw.advancers_per_group);
            if (!Number.isInteger(count) || count < 2) throw new Error('Confirm the number of group qualifiers before scheduling.');
            const source = fixtures.filter(m => m.draw_id === draw.id);
            const allPlayers = [...new Set(source.flatMap(m => m.players))];
            const provisional = generateKnockoutDraft(Array.from({ length: count }, (_, i) => ({ id: `qualifier-${i}`, team_name: `Qualifier ${i + 1}`, seed_number: i + 1 })), {
                plateMode: draw.scoring_rules?.plate_mode || 'none', placementPlayoff: draw.scoring_rules?.playoff_mode || 'none',
            });
            const idFor = key => `${draw.id}:future:${key}`;
            for (const m of provisional.matches) {
                fixtures.push({ ...m, id: idFor(m.key), draw_id: draw.id, division_id: draw.division_id,
                    virtual: true, can_plan: true, label: `Pending qualification · ${m.round_label}`,
                    players: allPlayers, status: m.result_type === 'walkover' ? 'bye' : 'pending',
                    final: m.stage === 'knockout' && !provisional.matches.some(n => n.source_slots?.some(s => s.source_match_key === m.key && s.type !== 'loser')),
                    dependency_ids: m.round_number === 1 ? source.map(s => s.id) : (m.source_slots || []).filter(s => s.source_match_key).map(s => idFor(s.source_match_key)),
                });
            }
        }
    }
    return fixtures;
}

export function scheduleIssues({ fixtures, assignments, playDays, settings }) {
    const issues = [];
    const rows = fixtures.filter(m => assignments[m.id] && m.status !== 'cancelled').map(m => ({ ...m, ...assignments[m.id] }));
    const byId = new Map(rows.map(m => [m.id, m]));
    for (const m of rows) {
        const start = Date.parse(m.scheduled_start), end = Date.parse(m.scheduled_end);
        if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) { issues.push(`${m.label}: invalid start or end time.`); continue; }
        const day = playDays.find(d => d.is_active && d.play_date === localDay(m.scheduled_start));
        const court = Number(/^Court (\d+)$/.exec(m.court_name)?.[1]);
        if (!day || !Number.isInteger(court) || court < 1 || court > day.courts_count || start < localStamp(day.play_date, day.start_time) || end > localStamp(day.play_date, day.end_time)) issues.push(`${m.label}: outside available courts or opening hours.`);
        if (settings.divisionDays?.[m.division_id]?.length && !settings.divisionDays[m.division_id].includes(localDay(m.scheduled_start))) issues.push(`${m.label}: this division cannot play on this day.`);
        if (m.not_before && start < Date.parse(m.not_before)) issues.push(`${m.label}: before the earliest allowed start.`);
        for (const dependency of m.dependency_ids || []) {
            const feeder = byId.get(dependency);
            if (fixtures.find(f => f.id === dependency)?.status === 'bye') continue;
            if (!feeder && RESOLVED.includes(fixtures.find(f => f.id === dependency)?.status)) continue;
            if (!feeder || start < Date.parse(feeder.scheduled_end) + Number(settings.rest) * minute) issues.push(`${m.label}: an earlier round must finish with enough rest first.`);
        }
        for (const other of rows) {
            if (other.id <= m.id) continue;
            const rest = intersect(m.players, other.players) ? Number(settings.rest) * minute : 0;
            if ((rest || intersect(m.players, other.players) || m.court_name === other.court_name)
                && start < Date.parse(other.scheduled_end) + rest && end + rest > Date.parse(other.scheduled_start)) issues.push(`${m.label} / ${other.label}: ${intersect(m.players, other.players) ? 'shared player or insufficient rest' : 'court overlap'}.`);
        }
    }
    return [...new Set(issues)];
}

/** Deterministic placement around reserved finals and manually pinned bookings. */
export function generateTournamentSchedule(data, suppliedSettings, pinned = {}) {
    const workflow = tournamentWorkflow(data);
    if (!workflow.ready) throw new Error(workflow.blockers.map(b => b.message).join('; ') || 'Add divisions first.');
    const settings = { ...defaultSettings(data.divisions), ...suppliedSettings };
    if (!Number.isInteger(Number(settings.duration)) || settings.duration < 1 || !Number.isInteger(Number(settings.rest)) || settings.rest < 0) throw new Error('Match duration must be positive and rest cannot be negative.');
    if (!/^\d{2}:\d{2}$/.test(settings.finalsTime) || !Number.isFinite(localStamp('2026-01-01', settings.finalsTime))) throw new Error('Choose a valid finals start time.');
    const namedRoles = Object.entries(settings.divisionRoles || {}).filter(([id, role]) => role !== 'other' && activeDivisions(data.divisions).some(d => d.id === id)).map(([, role]) => role);
    if (new Set(namedRoles).size !== namedRoles.length) throw new Error('Assign each named finals role to only one active division.');
    const days = data.playDays.filter(d => d.is_active).sort((a, b) => a.play_date.localeCompare(b.play_date));
    if (!days.length) throw new Error('Add playing days and courts in Event details.');
    const fixtures = tournamentFixtures(data);
    const required = fixtures.filter(m => !RESOLVED.includes(m.status));
    if (required.some(m => !m.can_plan)) throw new Error('Resolve incomplete teams or byes in Draws before scheduling.');
    const assignments = Object.fromEntries(Object.entries(pinned).filter(([id]) => fixtures.some(m => m.id === id)));
    for (const m of fixtures) if ((RESOLVED.includes(m.status) || m.status === 'in_progress') && m.scheduled_start) assignments[m.id] = { court_name: m.court_name, scheduled_start: m.scheduled_start, scheduled_end: m.scheduled_end, pinned: true };
    const last = days.at(-1);
    const finals = required.filter(m => m.final);
    const ladies = finals.find(m => settings.divisionRoles[m.division_id] === 'ladies_open');
    const orderedFinals = [...finals].sort((a, b) => ['ladies_open', 'mens_advanced', 'mens_open', 'other'].indexOf(settings.divisionRoles[a.division_id] || 'other') - ['ladies_open', 'mens_advanced', 'mens_open', 'other'].indexOf(settings.divisionRoles[b.division_id] || 'other'));
    const duration = m => {
        const minutes = Number(m.match_duration_minutes || settings.divisionDurations?.[m.division_id] || settings.duration);
        if (!Number.isInteger(minutes) || minutes < 1) throw new Error('Each division match duration must be a positive whole number.');
        return minutes * minute;
    };
    const fail = message => { throw new Error(`${message} Open Advanced settings to change the finals time, playing hours or available courts. The finals programme has not been moved.`); };
    const fits = (m, court, start, end) => {
        const day = days.find(d => d.play_date === localDay(iso(start)));
        if (!day || start < localStamp(day.play_date, day.start_time) || end > localStamp(day.play_date, day.end_time)) return false;
        if (settings.divisionDays[m.division_id]?.length && !settings.divisionDays[m.division_id].includes(day.play_date)) return false;
        if (m.not_before && start < Date.parse(m.not_before)) return false;
        return Object.entries(assignments).every(([id, a]) => {
            if (id === m.id) return true;
            const other = fixtures.find(f => f.id === id);
            const shared = other && intersect(m.players, other.players);
            const rest = shared ? Number(settings.rest) * minute : 0;
            return !(shared || court === a.court_name) || start >= Date.parse(a.scheduled_end) + rest || end + rest <= Date.parse(a.scheduled_start);
        });
    };
    for (const m of orderedFinals) {
        if (assignments[m.id]) continue;
        const role = settings.divisionRoles[m.division_id] || 'other';
        const override = settings.divisionFinalTimes?.[m.division_id];
        if (override && !/^([01]\d|2[0-3]):[0-5]\d$/.test(override)) throw new Error('Choose a valid final time for each division.');
        const start = override ? localStamp(last.play_date, override) : localStamp(last.play_date, settings.finalsTime) + (role === 'mens_open' && ladies ? duration(ladies) : 0);
        const courts = ['ladies_open', 'mens_open'].includes(role) ? [settings.centreCourt] : Array.from({ length: last.courts_count }, (_, i) => `Court ${i + 1}`).filter(c => role === 'other' || c !== settings.centreCourt);
        // Other finals may follow the named programme; named finals are strict anchors.
        let placed = false;
        for (let at = start; at + duration(m) <= localStamp(last.play_date, last.end_time); at += 5 * minute) {
            const court = courts.find(c => Number(c.replace('Court ', '')) <= last.courts_count && fits(m, c, at, at + duration(m)));
            if (court) { assignments[m.id] = { court_name: court, scheduled_start: iso(at), scheduled_end: iso(at + duration(m)) }; placed = true; break; }
            if (role !== 'other' || override) break;
        }
        if (!placed) {
            const name = data.divisions.find(d => d.id === m.division_id)?.name || 'Division';
            const conflict = Object.entries(assignments).find(([id, a]) => {
                const other = fixtures.find(f => f.id === id);
                return other && intersect(m.players, other.players) && start < Date.parse(a.scheduled_end) + Number(settings.rest) * minute && start + duration(m) + Number(settings.rest) * minute > Date.parse(a.scheduled_start);
            });
            const reason = conflict ? (() => {
                const other = fixtures.find(f => f.id === conflict[0]);
                return ` It shares possible players with ${data.divisions.find(d => d.id === other.division_id)?.name || 'another division'} (${localTime(conflict[1].scheduled_start)}–${localTime(conflict[1].scheduled_end)}). Allow ${settings.rest} minutes of rest between their matches; set separate division final times.`;
            })() : ` It needs ${duration(m) / minute} minutes within ${last.start_time.slice(0, 5)}–${last.end_time.slice(0, 5)} on ${last.play_date}, an available court and an allowed division playing day.`;
            fail(`Cannot place ${name} final at ${localTime(iso(start))}.${reason}`);
        }
    }
    const pending = required.filter(m => !assignments[m.id]).sort((a, b) => a.round_number - b.round_number || String(a.division_id).localeCompare(String(b.division_id)) || a.bracket_position - b.bracket_position);
    while (pending.length) {
        const index = pending.findIndex(m => (m.dependency_ids || []).every(id => assignments[id] || RESOLVED.includes(fixtures.find(f => f.id === id)?.status)));
        if (index < 0) fail('A match has an unresolved or circular dependency.');
        const [m] = pending.splice(index, 1);
        const earliest = Math.max(0, ...(m.dependency_ids || []).map(id => assignments[id] ? Date.parse(assignments[id].scheduled_end) + Number(settings.rest) * minute : 0));
        let placed = false;
        for (const day of days) {
            for (let at = Math.max(localStamp(day.play_date, day.start_time), earliest); at + duration(m) <= localStamp(day.play_date, day.end_time); at += 5 * minute) {
                for (let c = 1; c <= day.courts_count; c++) {
                    if (!fits(m, `Court ${c}`, at, at + duration(m))) continue;
                    assignments[m.id] = { court_name: `Court ${c}`, scheduled_start: iso(at), scheduled_end: iso(at + duration(m)) }; placed = true; break;
                }
                if (placed) break;
            }
            if (placed) break;
        }
        if (!placed) fail(`Not enough court time for ${m.label}.`);
    }
    const issues = scheduleIssues({ fixtures, assignments, playDays: days, settings });
    if (issues.length) fail(issues[0]);
    return { assignments, fixtures, settings };
}
