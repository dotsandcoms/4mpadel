import { prepareMatchResult } from '../../src/utils/matchResult.js';
import { calculateGroupStandings } from '../../src/utils/nativeDrawStandings.js';
import { validateAmericanoScore } from '../../src/utils/americano.js';
import { hasGroupPlayStarted } from '../../src/utils/drawGroupEditing.js';
import { scheduleDay } from '../../src/utils/drawScheduleBoard.js';
import { schedulePlayerKeys } from '../../src/utils/divisionSchedulePlan.js';

const copy = value => structuredClone(value);
const terminal = match => ['completed', 'walkover', 'retired', 'cancelled'].includes(match.status);
const rehearsalEmail = 'private-rehearsal@invalid.test';
const writable = new Set(['draws', 'draw_entries', 'draw_groups', 'draw_matches', 'draw_match_sets', 'draw_standings', 'draw_match_audit', 'draw_player_reviews', 'event_play_days', 'player_ranking_points', 'native_draw_announcements', 'tournament_divisions']);

// A deliberately finite, in-memory adapter. There is no network client, URL,
// credential, fallback, notification worker or live table in this module.
export function createRehearsalClient(snapshot, onSave = () => {}) {
    if (snapshot?.version !== 1 || !snapshot.owner_id || !snapshot.event?.id) throw new Error('Invalid rehearsal snapshot.');
    const initial = copy(snapshot);
    const empty = Object.fromEntries([...writable].map(table => [table, []]));
    let tables = initial.tables || {
        ...empty, tournament_divisions: initial.divisions, event_play_days: initial.play_days,
        players: initial.players, ranking_tiers: initial.ranking_tiers, ranking_points_table: initial.ranking_points_table,
    };
    tables.native_draw_edit_audit ??= [];
    let clock = Date.now();
    const now = () => new Date(clock = Math.max(Date.now(), clock + 1)).toISOString();
    const rows = table => {
        if (!Object.hasOwn(tables, table)) throw new Error(`The ${table} integration is disabled in private rehearsal.`);
        return tables[table];
    };
    const exportSnapshot = () => ({ ...copy(initial), tables: copy(tables) });
    const persist = () => onSave(exportSnapshot());
    const drawMatches = id => rows('draw_matches').filter(match => match.draw_id === id);
    const defaults = (table, row) => ({
        id: crypto.randomUUID(), created_at: now(), updated_at: now(),
        ...(table === 'draws' ? { status: 'draft', draw_kind: 'main', scoring_rules: {} } : {}),
        ...(table === 'draw_entries' ? { status: 'active', seed_number: null } : {}),
        ...(table === 'draw_matches' ? { status: 'pending', entry_one_id: null, entry_two_id: null, winner_entry_id: null, loser_entry_id: null } : {}),
        ...(table === 'native_draw_announcements' ? { is_active: true } : {}),
        ...copy(row),
    });

    function cascade(table, removed) {
        const ids = new Set(removed.map(row => row.id));
        if (table === 'draws') {
            const matches = rows('draw_matches').filter(row => ids.has(row.draw_id));
            cascade('draw_matches', matches);
            for (const name of ['draw_matches', 'draw_entries', 'draw_groups', 'draw_standings', 'native_draw_edit_audit']) tables[name] = rows(name).filter(row => !ids.has(row.draw_id));
        }
        if (table === 'draw_matches') {
            for (const name of ['draw_match_sets', 'draw_match_audit']) tables[name] = rows(name).filter(row => !ids.has(row.match_id));
        }
        if (table === 'draw_groups') tables.draw_standings = rows('draw_standings').filter(row => !ids.has(row.group_id));
        if (table === 'draw_entries') tables.draw_standings = rows('draw_standings').filter(row => !ids.has(row.entry_id));
    }

    function resolve(drawId) {
        const matches = drawMatches(drawId);
        for (let pass = 0; pass <= matches.length; pass++) {
            let changed = false;
            for (const match of matches) {
                if (!['pending', 'scheduled'].includes(match.status) || match.stage === 'group') continue;
                let ready = true;
                for (const [slot, field] of [[1, 'entry_one_id'], [2, 'entry_two_id']]) {
                    const feeder = matches.find(source => source.winner_to_match_id === match.id && Number(source.winner_to_slot) === slot || source.loser_to_match_id === match.id && Number(source.loser_to_slot) === slot);
                    if (!feeder) continue;
                    if (!terminal(feeder)) { ready = false; continue; }
                    const outcome = feeder.winner_to_match_id === match.id && Number(feeder.winner_to_slot) === slot ? feeder.winner_entry_id : feeder.loser_entry_id;
                    if (match[field] !== (outcome || null)) { match[field] = outcome || null; changed = true; }
                }
                if (ready && (!match.entry_one_id || !match.entry_two_id)) {
                    match.winner_entry_id = match.entry_one_id || match.entry_two_id || null;
                    match.loser_entry_id = null;
                    match.status = match.winner_entry_id ? 'walkover' : 'cancelled';
                    match.result_type = 'walkover'; match.updated_at = now(); changed = true;
                }
            }
            if (!changed) break;
        }
    }

    function result({ p_match: matchId, p_expected: expected, p_result: outcome }) {
        const match = rows('draw_matches').find(row => row.id === matchId);
        if (!match || !match.entry_one_id || !match.entry_two_id) throw new Error('Both participating teams must be known.');
        const draw = rows('draws').find(row => row.id === match.draw_id);
        if (!['published', 'in_progress', 'completed'].includes(draw?.status)) throw new Error('Publish the rehearsal draw first.');
        if (expected && expected !== match.updated_at) throw new Error('This rehearsal match changed. Reload it before saving.');
        const side = outcome.winner === match.entry_one_id ? 1 : outcome.winner === match.entry_two_id ? 2 : null;
        const prepared = prepareMatchResult({
            kind: outcome.kind, winner: side, totals: outcome.summary || [],
            sets: (outcome.sets || []).map(set => ({ ...set, duration: set.duration, games: set.games })),
            detailed: Boolean(outcome.sets?.length), setsToWin: Number(draw.scoring_rules?.sets_to_win) || 2,
            matchTiebreak: Boolean(draw.scoring_rules?.match_tiebreak),
        });
        const winner = prepared.kind === 'live' ? null : prepared.winner === 1 ? match.entry_one_id : match.entry_two_id;
        if (terminal(match)) {
            if (!outcome.reason?.trim()) throw new Error('Enter a reason for correcting this result.');
            if (match.stage === 'group' && drawMatches(draw.id).some(row => row.stage === 'knockout')) {
                throw new Error('The elimination draw uses these group standings. Start a fresh rehearsal to change them.');
            }
            if (match.winner_entry_id !== winner) {
                const downstream = new Set([match.winner_to_match_id, match.loser_to_match_id].filter(Boolean));
                for (const id of downstream) {
                    const next = rows('draw_matches').find(row => row.id === id);
                    if (!next) continue;
                    if (!['pending', 'scheduled', 'cancelled'].includes(next.status)) throw new Error('A dependent match has already started.');
                    for (const nextId of [next.winner_to_match_id, next.loser_to_match_id]) if (nextId && !downstream.has(nextId)) downstream.add(nextId);
                }
            }
        }
        Object.assign(match, {
            winner_entry_id: winner, loser_entry_id: winner ? winner === match.entry_one_id ? match.entry_two_id : match.entry_one_id : null,
            result_summary: prepared.summary, result_type: prepared.kind,
            status: prepared.kind === 'live' ? 'in_progress' : prepared.kind === 'retirement' ? 'retired' : ['walkover', 'withdrawal'].includes(prepared.kind) ? 'walkover' : 'completed',
            updated_at: now(),
        });
        tables.draw_match_sets = rows('draw_match_sets').filter(row => row.match_id !== match.id).concat(prepared.sets.map((set, index) => defaults('draw_match_sets', {
            match_id: match.id, set_number: index + 1, entry_one_games: set.games[0], entry_two_games: set.games[1],
            entry_one_tiebreak: set.tiebreak?.[0] ?? null, entry_two_tiebreak: set.tiebreak?.[1] ?? null, duration_minutes: set.duration,
        })));
        if (prepared.kind !== 'live') {
            for (const route of ['winner', 'loser']) {
                const next = rows('draw_matches').find(row => row.id === match[`${route}_to_match_id`]);
                if (next) next[Number(match[`${route}_to_slot`]) === 1 ? 'entry_one_id' : 'entry_two_id'] = match[`${route}_entry_id`];
            }
            resolve(draw.id);
        }
        if (match.group_id) tables.draw_standings = rows('draw_standings').filter(row => row.group_id !== match.group_id).concat(calculateGroupStandings({ entries: rows('draw_entries'), matches: rows('draw_matches'), matchSets: rows('draw_match_sets'), groupId: match.group_id }));
    }

    function saveAmericano(args) {
        const { p_event_id: eventId, p_division_id: divisionId, p_state: rotation, p_status: status, p_expected_updated_at: expected } = args;
        if (eventId !== initial.event.id || !initial.divisions.some(row => row.id === divisionId)) throw new Error('Choose a rehearsal division.');
        if (!['draft', 'published', 'in_progress', 'completed'].includes(status)) throw new Error('Invalid rehearsal draw status.');
        if (!rotation?.fixtures?.length || rotation.fixtures.some(fixture => fixture.score && !validateAmericanoScore(fixture.score, rotation.points))) throw new Error('Invalid Americano scores.');
        if (status === 'completed' && rotation.fixtures.some(fixture => !fixture.score)) throw new Error('Record every fixture before completing.');
        let draw = rows('draws').find(row => row.division_id === divisionId && row.draw_kind === 'main');
        if (draw && expected !== draw.updated_at) throw new Error('This rehearsal draw changed. Reload before saving.');
        if (!draw) { draw = defaults('draws', { event_id: eventId, division_id: divisionId }); rows('draws').push(draw); }
        Object.assign(draw, { format: 'americano', status, scoring_rules: { americano: copy(rotation) }, updated_at: now() });
        if (status !== 'draft') {
            const previous = drawMatches(draw.id);
            tables.draw_matches = rows('draw_matches').filter(row => row.draw_id !== draw.id).concat(rotation.fixtures.map(fixture => defaults('draw_matches', {
                ...previous.find(row => row.americano_fixture_key === fixture.id), draw_id: draw.id,
                americano_fixture_key: fixture.id, stage: 'group', round_number: fixture.round, round_label: `Round ${fixture.round}`,
                bracket_position: fixture.wave, court_name: `Court ${fixture.court}`, scheduled_start: fixture.scheduled_start || null,
                scheduled_end: fixture.scheduled_end || null, status: fixture.score ? 'completed' : fixture.scheduled_start ? 'scheduled' : 'pending',
            })));
        }
        return draw;
    }

    function saveGroupDraw({ p_event: eventId, p_division: divisionId, p_expected: expected, p_format: format,
        p_places: places, p_rules: rules, p_groups: groups, p_entries: entries, p_matches: matches, p_history: history }) {
        if (eventId !== initial.event.id || !initial.divisions.some(division => division.id === divisionId)) throw new Error('Choose a rehearsal division.');
        let draw = rows('draws').find(current => current.division_id === divisionId && current.draw_kind === 'main');
        if ((draw?.updated_at ?? null) !== expected || (draw && draw.status !== 'draft')) throw new Error('The rehearsal draw changed. Reload before saving.');
        if (!draw) {
            draw = defaults('draws', { event_id: eventId, division_id: divisionId });
            rows('draws').push(draw);
        }
        cascade('draw_matches', drawMatches(draw.id));
        const draftRows = [
            ['draw_groups', groups], ['draw_entries', entries],
            ['draw_matches', matches.map(match => ({ ...match, stage: 'group' }))],
            ['draw_standings', entries.map(entry => ({ group_id: entry.group_id, entry_id: entry.id, played: 0 }))],
        ];
        for (const [table, records] of draftRows) {
            tables[table] = rows(table).filter(row => row.draw_id !== draw.id)
                .concat(records.map(row => defaults(table, { ...row, draw_id: draw.id })));
        }
        Object.assign(draw, { format, group_count: groups.length, advancers_per_group: places, scoring_rules: copy(rules),
            seeding_method: 'native_ranking', generated_at: now(), updated_at: now() });
        for (const edit of history) auditGroupDraw(draw, edit);
        return draw.id;
    }

    function auditGroupDraw(draw, edit) {
        rows('native_draw_edit_audit').push(defaults('native_draw_edit_audit', {
            ...edit, draw_id: draw.id, generation: draw.generated_at, actor_id: initial.owner_id, actor_email: rehearsalEmail,
        }));
    }

    function matchesAtVersion(matches, versions) {
        return matches.length === Object.keys(versions).length && matches.every(match => match.updated_at === versions[match.id]);
    }

    function editGroupDraw({ p_draw: drawId, p_expected: expected, p_versions: versions, p_two_groups: groupIds,
        p_source: sourceId, p_target: targetId, p_fixtures: fixtures, p_undo: undo }) {
        const draw = rows('draws').find(current => current.id === drawId);
        const matches = drawMatches(drawId);
        if (!draw || draw.updated_at !== expected || !['draft', 'published', 'in_progress'].includes(draw.status)
            || matches.some(match => match.stage !== 'group')) throw new Error('The rehearsal draw changed or is locked.');
        if (hasGroupPlayStarted(matches, undo ? undefined : groupIds)) throw new Error('Group play has started. The affected fixtures are locked.');
        const affected = matches.filter(match => groupIds.includes(match.group_id));
        if (!matchesAtVersion(affected, versions)) throw new Error('A rehearsal fixture or booking changed. Reload first.');
        if (undo) {
            const audit = rows('native_draw_edit_audit').filter(edit => edit.draw_id === draw.id && edit.generation === draw.generated_at);
            const latest = audit.findLast(edit => edit.action === 'group_edit' && !audit.some(other => other.undo_of === edit.id));
            if (latest?.id !== undo) throw new Error('Only the most recent group edit can be undone.');
        }
        const teams = rows('draw_entries');
        const source = teams.find(entry => entry.id === sourceId && entry.draw_id === drawId && entry.group_id === groupIds[0]);
        const target = teams.find(entry => entry.id === targetId && entry.draw_id === drawId && entry.group_id === groupIds[1]);
        if (!source || (targetId && !target)) throw new Error('A team has moved. Reload the rehearsal first.');
        const describe = (entry, groupId) => ({
            id: entry?.id, registration: entry?.source_registration_id, name: entry?.team_name,
            group: rows('draw_groups').find(group => group.id === groupId)?.name,
        });
        const details = { source: describe(source, groupIds[0]), target: describe(target, groupIds[1]) };
        source.group_id = groupIds[1];
        if (target) target.group_id = groupIds[0];
        const retained = new Set(fixtures.map(fixture => fixture.id));
        cascade('draw_matches', affected.filter(match => !retained.has(match.id)));
        const changedBookings = [];
        const updated = fixtures.map(fixture => {
            const previous = affected.find(match => match.id === fixture.id);
            if (previous) {
                if (previous.scheduled_start && (previous.entry_one_id !== fixture.entry_one_id || previous.entry_two_id !== fixture.entry_two_id)) changedBookings.push(previous);
                return Object.assign(previous, copy(fixture), { updated_at: now() });
            }
            return defaults('draw_matches', { ...fixture, id: crypto.randomUUID(), draw_id: drawId, stage: 'group' });
        });
        tables.draw_matches = rows('draw_matches').filter(match => match.draw_id !== drawId || !groupIds.includes(match.group_id)).concat(updated);
        const entryMap = new Map(teams.map(team => [team.id, team]));
        const conflicts = changedBookings.filter(match => {
            const starts = Date.parse(match.scheduled_start);
            const ends = Date.parse(match.scheduled_end) || starts + 30 * 60_000;
            const day = rows('event_play_days').find(item => item.play_date === scheduleDay(match.scheduled_start));
            const rest = (Number(day?.minimum_break_minutes) || 0) * 60_000;
            const players = new Set(schedulePlayerKeys(match, entryMap));
            return rows('draw_matches').some(other => {
                if (other.id === match.id || other.status === 'cancelled' || !other.scheduled_start) return false;
                const otherStart = Date.parse(other.scheduled_start);
                const otherEnd = Date.parse(other.scheduled_end) || otherStart + 30 * 60_000;
                return otherStart < ends + rest && otherEnd + rest > starts
                    && schedulePlayerKeys(other, entryMap).some(player => players.has(player));
            });
        });
        for (const match of conflicts) Object.assign(match, { status: 'pending', scheduled_start: null, scheduled_end: null, court_name: null });
        tables.draw_standings = rows('draw_standings').filter(row => !groupIds.includes(row.group_id))
            .concat(teams.filter(entry => groupIds.includes(entry.group_id)).map(entry => defaults('draw_standings', {
                draw_id: drawId, group_id: entry.group_id, entry_id: entry.id, played: 0,
            })));
        auditGroupDraw(draw, { action: undo ? 'group_undo' : 'group_edit', undo_of: undo, details });
        draw.updated_at = now();
        return conflicts.length;
    }

    function qualifyGroupDraw({ p_draw: drawId, p_expected: expected, p_versions: versions, p_matches: matches, p_qualification: qualification }) {
        const draw = rows('draws').find(current => current.id === drawId);
        const groups = drawMatches(drawId);
        if (!draw || draw.updated_at !== expected || draw.format !== 'group_knockout' || !['published', 'in_progress'].includes(draw.status)
            || groups.some(match => match.stage !== 'group')) throw new Error('The rehearsal draw changed or elimination already exists.');
        if (!matchesAtVersion(groups, versions) || groups.some(match => !terminal(match) || match.status === 'cancelled')) {
            throw new Error('Complete and reload group results before creating elimination.');
        }
        rows('draw_matches').push(...matches.map(match => defaults('draw_matches', {
            ...match, draw_id: drawId, status: match.result_type === 'walkover' ? 'walkover' : 'pending',
        })));
        auditGroupDraw(draw, { action: qualification.reason ? 'qualification_override' : 'qualification', details: qualification });
        draw.updated_at = now();
        resolve(drawId);
    }

    const rpc = async (name, args = {}) => {
        const before = copy(tables);
        try {
            let data = null;
            if (name === 'resolve_draw_routes') resolve(args.p_draw_id);
            else if (name === 'native_record_draw_result') result(args);
            else if (name === 'save_americano_draw') data = saveAmericano(args);
            else if (name === 'native_save_group_draw') data = saveGroupDraw(args);
            else if (name === 'native_apply_group_edit') data = editGroupDraw(args);
            else if (name === 'native_create_group_elimination') qualifyGroupDraw(args);
            else if (name === 'reopen_native_draw_for_corrections') {
                const draw = rows('draws').find(row => row.id === args.p_draw_id);
                if (!draw || drawMatches(draw.id).some(match => terminal(match) && match.entry_one_id && match.entry_two_id)) throw new Error('Played results must be cleared by starting a fresh rehearsal.');
                draw.status = 'draft'; draw.updated_at = now();
            } else if (name === 'remove_event_play_day') {
                if (args.p_event_id !== initial.event.id) throw new Error('Invalid rehearsal event.');
                const day = rows('event_play_days').find(row => row.play_date === args.p_play_date);
                if (day) Object.assign(day, { is_removed: true, is_active: false });
                else rows('event_play_days').push(defaults('event_play_days', { event_id: initial.event.id, play_date: args.p_play_date, is_removed: true, is_active: false }));
            } else throw new Error(`The ${name} integration is disabled in private rehearsal.`);
            persist(); return { data: copy(data), error: null };
        } catch (error) { tables = before; return { data: null, error: { message: error.message } }; }
    };

    function from(table) {
        const filters = [], orders = [];
        let action = 'read', payload, conflicts, single = false, optional = false, offset = 0, last = Infinity, execution;
        const value = (row, path) => path.startsWith('draws.') ? rows('draws').find(draw => draw.id === row.draw_id)?.[path.slice(6)] : row[path];
        const matches = row => filters.every(filter => filter(row));
        const builder = {
            select: () => builder,
            eq: (field, expected) => { filters.push(row => value(row, field) === expected); return builder; },
            in: (field, values) => { filters.push(row => values.includes(value(row, field))); return builder; },
            is: (field, expected) => { filters.push(row => (value(row, field) ?? null) === expected); return builder; },
            order: (field, options = {}) => { orders.push([field, options.ascending !== false]); return builder; },
            range: (start, end) => { offset = start; last = end; return builder; },
            limit: count => { last = offset + count - 1; return builder; },
            single: () => { single = true; return builder; },
            maybeSingle: () => { single = true; optional = true; return builder; },
            insert: data => { action = 'insert'; payload = data; return builder; },
            upsert: (data, options = {}) => { action = 'upsert'; payload = data; conflicts = options.onConflict?.split(',') || [table === 'draw_player_reviews' ? 'division_id' : 'id']; return builder; },
            update: data => { action = 'update'; payload = data; return builder; },
            delete: () => { action = 'delete'; return builder; },
            then: (resolve, reject) => {
                execution ||= Promise.resolve().then(() => {
                    const before = action === 'read' ? null : copy(tables);
                    try {
                        let result = rows(table).filter(matches);
                        if (action !== 'read') {
                            if (!writable.has(table)) throw new Error(`The ${table} snapshot is read-only.`);
                            if (action === 'insert' || action === 'upsert') result = (Array.isArray(payload) ? payload : [payload]).map(row => {
                                const existing = action === 'upsert' && rows(table).find(item => conflicts.every(field => item[field] === row[field]));
                                if (existing) { Object.assign(existing, copy(row), { updated_at: now() }); return existing; }
                                const created = defaults(table, row); rows(table).push(created); return created;
                            });
                            if (action === 'update') result.forEach(row => Object.assign(row, copy(payload), { updated_at: now() }));
                            if (action === 'delete') { cascade(table, result); tables[table] = rows(table).filter(row => !matches(row)); }
                        }
                        for (const [field, ascending] of [...orders].reverse()) result.sort((a, b) => (value(a, field) > value(b, field) ? 1 : value(a, field) < value(b, field) ? -1 : 0) * (ascending ? 1 : -1));
                        result = result.slice(offset, last === Infinity ? undefined : last + 1);
                        if (single && (result.length > 1 || !optional && !result.length)) throw new Error('The rehearsal record was not found or is not unique.');
                        if (action !== 'read') persist();
                        // Scheduling reads join these fields; all values are local.
                        const data = result.map(row => ({ ...copy(row), ...(row.draw_id ? { draws: copy(rows('draws').find(draw => draw.id === row.draw_id)) } : {}) }));
                        return { data: single ? data[0] || null : data, error: null };
                    } catch (error) { if (before) tables = before; return { data: null, error: { message: error.message } }; }
                });
                return execution.then(resolve, reject);
            },
        };
        return builder;
    }
    return { from, rpc, exportSnapshot, auth: { getUser: async () => ({ data: { user: { id: initial.owner_id, email: rehearsalEmail } }, error: null }) } };
}
