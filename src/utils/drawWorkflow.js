import { planningMatches } from './drawPlanning.js';

export const drawWorkflowSteps = [
    { key: 'players', title: 'Teams & seeds', description: 'Check entrants, pairs and seed order.' },
    { key: 'setup', title: 'Draw', description: 'Choose the format, adjust the bracket and save it.' },
    { key: 'schedule', title: 'Schedule & publish', description: 'Assign courts and times, then publish your draw.' },
    { key: 'run', title: 'Results & points', description: 'Enter scores, confirm placements and award points.' },
];

/** Published entrants are frozen, even if registrations later change. */
export function divisionWorkflow(division, { reviews = {}, draws = [], matches = [], entries = [], awards = [] } = {}) {
    const own = draws.filter(draw => draw.division_id === division.id);
    const main = own.find(draw => draw.draw_kind === 'main') || own[0];
    const games = matches.filter(match => own.some(draw => draw.id === match.draw_id) && !['cancelled', 'bye'].includes(match.status));
    const resultGames = planningMatches(games).filter(match => !(['knockout', 'placement'].includes(match.stage) && (match.is_automatic_bye || match.is_empty_path)));
    const playable = resultGames.filter(match => match.status !== 'walkover' && match.result_type !== 'walkover');
    const rotation = main?.format === 'americano' ? main.scoring_rules?.americano : null;
    const fixtures = rotation?.fixtures || [];
    const total = rotation ? fixtures.length : playable.length;
    const resultsTotal = rotation ? fixtures.length : resultGames.length;
    const scheduled = rotation ? fixtures.filter(match => match.scheduled_start && match.court).length : playable.filter(match => match.scheduled_start && match.court_name).length;
    const finished = rotation ? fixtures.filter(match => match.score).length : resultGames.filter(match => ['completed', 'walkover', 'retired'].includes(match.status)).length;
    const published = Boolean(own.length && own.every(draw => draw.status !== 'draft'));
    const completed = Boolean(own.length && own.every(draw => draw.status === 'completed'));
    const confirmed = Boolean(reviews[division.id]?.valid || published);
    const pointsApplicable = Boolean(main && ['knockout', 'group_knockout'].includes(main.format));
    const mainEntries = entries.filter(entry => entry.draw_id === main?.id);
    const playerIds = [...new Set(mainEntries.flatMap(entry => [entry.player_one_id, entry.player_two_id]).filter(Boolean))];
    const awarded = new Set(awards.filter(award => award.division_id === division.id).map(award => award.player_id));
    const pointsComplete = !pointsApplicable || (mainEntries.length > 0
        && mainEntries.every(entry => entry.player_one_id && (!entry.player_two_name || entry.player_two_id))
        && playerIds.length > 0 && playerIds.every(id => awarded.has(id)));
    const steps = [
        { ...drawWorkflowSteps[0], complete: confirmed, detail: confirmed ? 'Entrants confirmed' : 'Confirm entrants and seed order' },
        { ...drawWorkflowSteps[1], complete: Boolean(main), detail: main ? 'Draw saved' : 'Generate and save a preview' },
        { ...drawWorkflowSteps[2], complete: completed || (published && scheduled === total), detail: completed ? 'Published' : !main ? 'Assign courts and times' : `${scheduled}/${total} scheduled · ${published ? 'published' : 'not published'}` },
        { ...drawWorkflowSteps[3], complete: completed && pointsComplete, detail: completed ? pointsComplete ? (pointsApplicable ? 'Results and points complete' : 'Results complete') : 'Results complete · review points' : `${finished}/${resultsTotal} results recorded` },
    ];
    const next = completed || finished > 0 || games.some(match => match.status === 'in_progress') ? 'run'
        : !confirmed ? 'players' : !main ? 'setup' : !steps[2].complete ? 'schedule' : 'run';
    const complete = steps.every(step => step.complete);
    const label = complete ? 'Complete' : completed ? 'Review points' : !confirmed ? 'Confirm teams' : !main ? 'Create draw' : main.status === 'draft' ? 'Schedule & publish' : next === 'schedule' ? 'Finish scheduling' : 'Enter results';
    return { steps, next, complete, label, main, scheduled, playable: total, finished, resultsTotal, published, completed, pointsComplete, teamCount: rotation ? rotation.variant === 'team' ? rotation.teams?.length || 0 : rotation.players?.length || 0 : mainEntries.length, entryUnit: rotation && rotation.variant !== 'team' ? 'players' : 'teams', awardCount: playerIds.filter(id => awarded.has(id)).length };
}
