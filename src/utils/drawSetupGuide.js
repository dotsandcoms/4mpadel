import {planningMatches} from './drawPlanning.js';

/** Division switching resumes its draw; opening player review remains explicit. */
export function divisionOpeningWorkspace({ requestedStep, hasDraw = false, reviewValid = false }) {
    if (requestedStep) return requestedStep;
    if (hasDraw) return 'review';
    return reviewValid ? 'setup' : 'players';
}

/** Guidance follows persisted progress without publishing or saving implicitly. */
export function drawSetupGuide({division, workspace, savedDraw, previewReady, dirty, format, playerCount, matches = []}) {
    if (!division) return {title:'Start with a division', body:'Choose the division below. You’ll set its format and players, review the draw, assign court times, then publish when you’re ready.'};
    const americano = format === 'americano';
    const saved = Boolean(savedDraw?.id);
    const published = saved && savedDraw.status !== 'draft';
    const fixtures = americano ? savedDraw?.scoring_rules?.americano?.fixtures || [] : matches;
    const readyMatches = (americano ? fixtures : planningMatches(fixtures)).filter(m => americano || m.can_plan || (m.entry_one_id || m.entry_one) && (m.entry_two_id || m.entry_two));
    const missing = readyMatches.filter(m => !m.scheduled_start || (!americano && !m.court_name)).length;
    if (['completed','archived'].includes(savedDraw?.status)) return {title:'This draw is closed',body:'Review the final draw and results. Players and completed matches are locked.',action:'View results',target:'run'};
    if (workspace === 'setup') {
        if (published) return {title:'Your draw is published',body:'Players and pairings are locked. Continue to court times or enter results in Run.',action:'Go to Schedule',target:'schedule'};
        if (previewReady && !dirty) return {title:'Your preview is ready to review',body:'Check the entrants and matchups before saving. Saving a draft keeps it private.',action:'Review draw',target:'review'};
        return {title:`Set up ${division.name}`,body:americano ? `${playerCount} paid individual registrations available. Choose rounds, total rally points and courts, then Generate rotation preview. Each player needs their own registration.` : `${playerCount} paid pairs available. Choose a format below, check the field, then Generate preview. Use Advanced only if you need seeding, plates or playoffs.`};
    }
    if (workspace === 'review') {
        if (!saved || dirty) return {title:'Check the draw, then save a draft',body:'Review the players and matchups below. Save the draft when they’re correct; you can assign courts and times before publishing.'};
        return {title:published ? 'Review your published draw' : 'Draft saved — arrange court times next',body:published ? 'Pairings are locked. Use Schedule for court changes or Run for scores.' : 'The draft is private. Set the play days and assign matches in Schedule. Return here to publish once you’ve checked everything.',action:'Continue to Schedule',target:'schedule'};
    }
    if (workspace === 'schedule') {
        if (!saved || dirty) return {title:'Save the draw before assigning matches',body:'Set your play days below. Save the draft to enable scheduling; if you have no preview yet, generate one in Setup.',action:'Review draw',target:'review'};
        if (missing) return {title:`Assign times for ${missing} ${missing === 1 ? 'match' : 'matches'}`,body:`Set and save the play days, hours and courts below. Choose Automatically assign courts & times, adjust the preview, then Save schedule.${format === 'group_knockout' ? ' The elimination stage is created after group qualifiers are confirmed; its placement brackets can then be booked before their teams are known.' : ''}`};
        return {title:'Review your court schedule',body:published ? 'Drag matches to adjust their court or time and save any changes. Open Run when you’re ready to record results.' : 'Check court times and save any adjustments below. Return to Review to publish; saving a schedule does not publish the draw.',action:published ? 'Continue to Run' : 'Review and publish',target:published ? 'run' : 'review'};
    }
    return {title:'Run the event',body:americano ? 'Select a round and enter both pairs’ scores. Their total must equal the rally-point target. Individual standings update as you save results.' : 'Find a match, mark it live and record its result. Winners advance automatically; for groups + knockout, complete the groups before creating the knockout stage.'};
}
