export const RESOLVED = ['completed', 'walkover', 'retired', 'cancelled', 'bye'];
export const PUBLISHED = ['published', 'in_progress', 'completed'];
export const FORMATS = { knockout: 'Knockout', group_only: 'Round robin', group_knockout: 'Groups + knockout', americano: 'Americano', team_americano: 'Team Americano' };
export const activeDivisions = divisions => divisions.filter(d => d.is_active !== false && !['cancelled', 'archived'].includes(d.status));
export function tournamentWorkflow({ divisions = [], draws = [], matches = [], confirmations = [], schedule = null, finalisations = [] }) {
    const rows = activeDivisions(divisions).map(division => {
        const own = draws.filter(d => d.division_id === division.id && d.status !== 'archived');
        const main = own.find(d => d.draw_kind === 'main');
        const games = matches.filter(m => own.some(d => d.id === m.draw_id));
        const confirmation = confirmations.find(c => c.division_id === division.id);
        const published = Boolean(main && own.every(d => PUBLISHED.includes(d.status)));
        const complete = games.length > 0 && own.every(d => d.format !== 'group_knockout' || games.some(m => m.draw_id === d.id && m.stage === 'knockout')) && games.every(m => RESOLVED.includes(m.status));
        const finalised = finalisations.some(f => f.division_id === division.id && f.valid !== false);
        return { division, main, games, published, complete, finalised, confirmation,
            players: Boolean(confirmation?.players_confirmed_at && confirmation?.players_valid !== false),
            seeds: Boolean(confirmation?.seeds_confirmed_at && confirmation?.seeds_valid !== false),
            format: Boolean(confirmation?.format_confirmed_at),
            resolved: games.filter(m => RESOLVED.includes(m.status)).length,
        };
    });
    const blockers = rows.filter(r => !r.published).map(r => ({ divisionId: r.division.id, workspace: 'draws', message: `${r.division.name}: ${r.main ? 'publish the draw' : 'create and publish a draw'}` }));
    const ready = rows.length > 0 && blockers.length === 0;
    const live = matches.some(m => m.status === 'in_progress' || (m.entry_one_id && m.entry_two_id && ['completed', 'walkover', 'retired'].includes(m.status)));
    const phase = rows.length && rows.every(r => r.finalised) ? 'Complete' : live ? 'Live' : ready ? 'Schedule' : rows.length ? 'Prepare' : 'Setup';
    const next = blockers[0] || (ready && schedule?.status !== 'published' ? { workspace: 'schedule', message: 'Review and publish the tournament schedule' } : { workspace: 'results', message: 'Open tournament live & results' });
    return { rows, blockers, ready, phase, next };
}

export function inferFinalRole(division) {
    // Used once to prepopulate an editable persisted mapping, never during placement.
    const name = String(division.name || '').toLowerCase().replace(/[’']/g, '');
    if (/^(ladies|womens?)\s+open$/.test(name)) return 'ladies_open';
    if (/^mens?\s+open$/.test(name)) return 'mens_open';
    if (/^mens?\s+(advanced|challengers)(\s*\/.*)?$/.test(name)) return 'mens_advanced';
    return 'other';
}
export function defaultSettings(divisions = []) {
    return { finalsTime: '17:00', centreCourt: 'Court 1', duration: 60, rest: 10,
        divisionRoles: Object.fromEntries(divisions.map(d => [d.id, inferFinalRole(d)])), divisionDays: {} };
}
