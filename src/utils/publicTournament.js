import { planningMatches } from './drawPlanning.js';

export const tournamentTabs = [
    { id: 'order-of-play', label: 'Order of Play' },
    { id: 'draws', label: 'Draws' },
    { id: 'results', label: 'Results' },
    { id: 'players', label: 'Player List' },
];
export const finishedMatch = match => ['completed', 'walkover', 'retired'].includes(match.status);
export function publicTournamentTab(params) {
    const value = (params.get('tab') || '').toLowerCase().replace(/\s+/g, '-');
    if (value === 'player-list') return 'players';
    return tournamentTabs.some(tab => tab.id === value) ? value : params.has('draw') || params.has('match') ? 'draws' : 'order-of-play';
}
export function tournamentParams(current, changes) {
    const next = new URLSearchParams(current);
    Object.entries(changes).forEach(([key, value]) => value == null || value === '' ? next.delete(key) : next.set(key, String(value)));
    return next;
}
export function tournamentDivisions(draws) {
    const divisions = new Map();
    const order = { main: 0, silver: 1, bronze: 2 };
    draws.forEach(draw => {
        const id = draw.division_id || draw.id;
        const division = divisions.get(id) || { id, name: draw.tournament_divisions?.name || 'Division', draws: [] };
        division.draws.push(draw);
        divisions.set(id, division);
    });
    return [...divisions.values()].map(division => ({ ...division, draws: [...division.draws].sort((a, b) => (order[a.draw_kind] ?? 9) - (order[b.draw_kind] ?? 9)) }));
}
export const drawKindLabel = kind => ({ main: 'Main draw', silver: 'Silver plate', bronze: 'Bronze plate' }[kind] || 'Draw');
export function bracketSections(matches) {
    const branches = new Map();
    matches.filter(match => ['knockout', 'placement'].includes(match.stage)).forEach(match => {
        const range = /^places_(\d+)_(\d+)_r\d+$/.exec(match.round_code || '');
        const id = match.stage === 'knockout' ? 'main' : range ? `places-${range[1]}-${range[2]}` : match.round_code || 'placement';
        const label = id === 'main' ? 'Main draw' : range ? `Places ${range[1]}–${range[2]}` : match.round_code === '3_4' ? 'Places 3–4' : match.round_label || 'Placement playoff';
        const branch = branches.get(id) || { id, label, order: id === 'main' ? 0 : Number(range?.[1] || 3), matches: [] };
        branch.matches.push(match);
        branches.set(id, branch);
    });
    return [...branches.values()].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
}
export function bracketRounds(matches) {
    const rounds = new Map();
    matches.forEach(match => {
        const round = rounds.get(match.round_number) || { number: match.round_number, label: match.round_label, matches: [] };
        round.matches.push(match);
        rounds.set(match.round_number, round);
    });
    return [...rounds.values()].sort((a, b) => a.number - b.number).map(round => ({ ...round, matches: round.matches.sort((a, b) => a.bracket_position - b.bracket_position) }));
}
export function sastDay(value) {
    if (!value || !Number.isFinite(new Date(value).getTime())) return '';
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}
export function sastTime(value) {
    if (!value || !Number.isFinite(new Date(value).getTime())) return '';
    return new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Johannesburg', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}
export function playDayLabel(day, long = false) {
    return new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Johannesburg', weekday: long ? 'long' : 'short', day: 'numeric', month: long ? 'long' : 'short' }).format(new Date(`${day}T12:00:00+02:00`));
}
// Include future feeder matches, but never schedule automatic advances or empty paths.
export function publicSchedule(matches) {
    return planningMatches(matches).filter(match => match.status !== 'cancelled' && match.scheduled_start && sastDay(match.scheduled_start) && !match.is_automatic_bye && !match.is_empty_path)
        .sort((a, b) => new Date(a.scheduled_start) - new Date(b.scheduled_start) || (a.court_name || '').localeCompare(b.court_name || '', undefined, { numeric: true }));
}
export function scheduleCourts(matches, day, division = 'all') {
    const courts = new Map();
    matches.filter(match => sastDay(match.scheduled_start) === day && (division === 'all' || match.division_id === division)).forEach(match => {
        const name = match.court_name || 'Court to be confirmed';
        const court = courts.get(name) || { name, matches: [] };
        court.matches.push(match);
        courts.set(name, court);
    });
    return [...courts.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}
export function scoreColumns(match, sets) {
    const rows = sets.filter(set => set.match_id === match.id).sort((a, b) => a.set_number - b.set_number);
    const summary = match.result_summary;
    return [1, 2].map(slot => ({
        total: Array.isArray(summary) && summary[slot - 1] != null ? summary[slot - 1] : rows.length ? rows.filter(set => {
            const a = Number(set.entry_one_games), b = Number(set.entry_two_games), high = Math.max(a, b), low = Math.min(a, b);
            const complete = set.is_match_tiebreak ? high >= 10 && high - low >= 2 : high === 6 && low <= 4 || high === 7 && [5, 6].includes(low);
            return complete && (slot === 1 ? a > b : b > a);
        }).length : null,
        sets: rows.map(set => ({ games: set[`entry_${slot === 1 ? 'one' : 'two'}_games`], tiebreak: set[`entry_${slot === 1 ? 'one' : 'two'}_tiebreak`], matchTiebreak: set.is_match_tiebreak })),
    }));
}
export function matchStatusLabel(match) {
    if (match.status === 'cancelled') return 'Cancelled';
    if (match.status === 'in_progress') return 'Live';
    if (finishedMatch(match) && (!match.entry_one_id || !match.entry_two_id)) return 'Bye';
    if (match.result_type === 'withdrawal') return 'Withdrawal';
    if (match.result_type === 'walkover' || match.status === 'walkover') return 'Walkover';
    if (match.result_type === 'retirement' || match.status === 'retired') return 'Retired';
    if (finishedMatch(match)) return !match.entry_one_id || !match.entry_two_id ? 'Bye' : 'Final score';
    return match.scheduled_start ? sastTime(match.scheduled_start) : 'Time TBC';
}

// Rotation fixtures use their saved pairs; no registration partners are inferred.
export function publicRotations(draws) {
    const entries = [], matches = [];
    draws.forEach(draw => {
        const rotation = draw.scoring_rules?.americano;
        if (!rotation) return;
        const players = new Map(rotation.players.map(player => [player.id, player]));
        rotation.fixtures.forEach(fixture => {
            const sides = [fixture.one, fixture.two].map((ids, index) => {
                const pair = ids.map(id => players.get(id)).filter(Boolean);
                const entry = { id: `${draw.id}:${fixture.id}:${index}`, draw_id: draw.id, player_one_id: pair[0]?.id, player_one_name: pair[0]?.name, player_two_id: pair[1]?.id, player_two_name: pair[1]?.name, team_name: pair.map(player => player.name).join(' / ') };
                entries.push(entry);
                return entry.id;
            });
            const winner = fixture.score && fixture.score[0] !== fixture.score[1] ? (fixture.score[0] > fixture.score[1] ? 0 : 1) : null;
            matches.push({ id: fixture.id, draw_id: draw.id, division_id: draw.division_id, stage: 'americano', round_number: fixture.round, round_label: `Round ${fixture.round}`, bracket_position: fixture.court, status: fixture.score ? 'completed' : 'pending', entry_one_id: sides[0], entry_two_id: sides[1], winner_entry_id: winner == null ? null : sides[winner], result_summary: fixture.score || null, score_unit: 'points', scheduled_start: fixture.scheduled_start, scheduled_end: fixture.scheduled_end, court_name: fixture.court_name || `Court ${fixture.court}` });
        });
    });
    return { entries, matches };
}
