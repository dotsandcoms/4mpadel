// Exact current MAIN tm_* contracts, isolated from the legacy admin.
const HOST_ROTATION_RESULTS = ['record_rotation_score', 'complete_rotation'];
const HOST_ACTIONS = new Set(['snapshot', 'confirm', 'save_draw', 'publish_draw', 'qualify', ...HOST_ROTATION_RESULTS]);
const isRotation = format => ['americano', 'team_americano'].includes(format);
const CONTEXT_CHANGED = 'Tournament context changed. No further changes were sent.';

export function createTournamentClient(supabase, { userId, scopeId = 'all', hostEvent, isCurrent = () => true } = {}) {
async function verifyActor() {
    if (!isCurrent()) throw new Error(CONTEXT_CHANGED);
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || auth?.user?.id !== userId) throw new Error('Your signed-in account changed. Reload Tournament Manager before saving.');
    if (!isCurrent()) throw new Error(CONTEXT_CHANGED);
}

async function tournamentRpc(name, args = {}) {
    let operation = `tm_${name}`;
    let payload = args;
    if (hostEvent) {
        if (!userId || !HOST_ACTIONS.has(name) || scopeId !== `org:${hostEvent.organisationId}`
            || String(args.p_event) !== String(hostEvent.id)) {
            throw new Error('Open the requested draw in its authorised organisation workspace.');
        }
        await verifyActor();
        const { p_event, rotation, ...fields } = args;
        const preparingRotation = rotation || (name === 'confirm' && args.p_kind === 'format' && isRotation(args.p_payload?.format))
            || (name === 'save_draw' && isRotation(args.p_draw?.format));
        if (name === 'qualify') operation = 'tm_host_group_qualification';
        else if (HOST_ROTATION_RESULTS.includes(name)) operation = 'tm_host_rotation_result';
        else operation = preparingRotation ? 'tm_host_rotation_preparation' : 'tm_host_draw_preparation';
        payload = { p_organisation: hostEvent.organisationId, p_event, p_action: name, p_payload: fields };
    } else if (!['list_events', 'snapshot'].includes(name)) {
        if (!isCurrent()) throw new Error(CONTEXT_CHANGED);
        if (!userId || scopeId !== 'all') throw new Error('Open Tournament Manager in the all-workspaces scope with your signed-in account before saving.');
        await verifyActor();
    }
    const { data, error } = await supabase.rpc(operation, payload);
    if (error) {
        if (error.code === 'PGRST202' || error.code === '42883' || error.code === '42P01') throw new Error('Tournament Manager is unavailable on this connection. Ask an administrator to check the installed tm_* backend.');
        throw new Error(error.message);
    }
    if (data?.error) throw new Error(typeof data.error === 'string' ? data.error : data.error.message || 'Tournament request failed.');
    if (hostEvent) {
        if (!isCurrent()) throw new Error(CONTEXT_CHANGED);
        const receivedEvent = name === 'snapshot' ? data?.event?.id : data?.eventId;
        const matchesAction = name === 'snapshot' ? data?.hostDrawPreparation === true : data?.action === name;
        if (data?.organisationId !== hostEvent.organisationId || String(receivedEvent) !== String(hostEvent.id) || !matchesAction
            || (args.p_division && args.p_division !== data?.divisionId)
            || (['publish_draw', 'qualify', ...HOST_ROTATION_RESULTS].includes(name) && args.p_draw !== data?.drawId)
            || (name === 'record_rotation_score' && (args.p_match !== data?.matchId || data?.status !== 'in_progress'))
            || (name === 'complete_rotation' && data?.status !== 'completed')
            || (name === 'save_draw' && !data?.drawId)) {
            throw new Error('The host tournament response did not match the reviewed event and draw.');
        }
    }
    return data;
}
return {
    saveRegistration: (data, division, registration, payload) => tournamentRpc('save_registration', { p_event: data.event.id, p_division: division, p_registration: registration?.id || null, p_payload: payload, p_expected: registration?._revision || null }),
    saveDivision: (data, division, name, active) => tournamentRpc('save_division', { p_event: data.event.id, p_division: division, p_name: name, p_active: active }),
    qualify: (data, draw, matches, rankedQualifiers, rankedOverride) => {
        const payload = { p_event: data.event.id, p_draw: draw.id, p_expected: draw.updated_at, p_matches: matches };
        if (hostEvent) {
            const groupMatches = new Map(data.matches.filter(m => m.draw_id === draw.id && m.stage === 'group').map(m => [m.id, m.updated_at]));
            payload.p_group_versions = Object.fromEntries(groupMatches);
            payload.p_group_sets = Object.fromEntries(data.sets.filter(set => groupMatches.has(set.match_id))
                .map(set => [set.match_id + ':' + set.set_number, [set.entry_one_games, set.entry_two_games, set.is_match_tiebreak]]));
            if (rankedQualifiers) {
                payload.p_ranked_qualifiers = rankedQualifiers;
                if (rankedOverride) payload.p_ranked_override = rankedOverride;
                payload.p_group_results = Object.fromEntries(data.matches.filter(m => groupMatches.has(m.id)).map(m => [m.id,
                    [m.group_id, m.entry_one_id, m.entry_two_id, m.winner_entry_id, m.status, m.result_summary ?? null]]));
            }
        }
        return tournamentRpc('qualify', payload);
    },
    list: () => tournamentRpc('list_events'),
    load: eventId => tournamentRpc('snapshot', { p_event: eventId }),
    saveSettings: (data, settings, days) => tournamentRpc('save_settings', { p_event: data.event.id, p_expected: data.settingsRevision, p_settings: settings, p_days: days }),
    confirm: (data, division, kind, payload) => tournamentRpc('confirm', { p_event: data.event.id, p_division: division, p_kind: kind, p_payload: payload, p_expected: data.confirmations.find(c => c.division_id === division)?.revision || 0 }),
    ...(hostEvent ? {
        recordRotationScore: (data, draw, match, score, reason) => tournamentRpc('record_rotation_score', {
            p_event: data.event.id, p_draw: draw.id, p_expected: draw.updated_at,
            p_match: match.id, p_expected_match: match.updated_at, p_score: score, p_reason: reason || null,
        }),
        completeRotation: (data, draw) => tournamentRpc('complete_rotation', {
            p_event: data.event.id, p_draw: draw.id, p_expected: draw.updated_at,
            p_match_versions: Object.fromEntries(data.matches.filter(m => m.draw_id === draw.id).map(m => [m.id, m.updated_at])),
        }),
        confirmFormatAndSeeds: (data, division, configuration, seeds) => tournamentRpc('confirm', {
            p_event: data.event.id, p_division: division, p_kind: 'format_and_seeds',
            p_payload: { configuration, seeds }, p_expected: data.confirmations.find(c => c.division_id === division)?.revision || 0,
        }),
    } : {}),
    saveDraw: (data, division, draw) => tournamentRpc('save_draw', {
        p_event: data.event.id, p_division: division, p_expected: data.confirmations.find(c => c.division_id === division)?.revision || 0, p_draw: draw,
        ...(hostEvent ? { p_draw_token: data.draws.find(row => row.division_id === division && row.draw_kind === 'main')?._review_token || null } : {}),
    }),
    publishDraw: (data, draw) => tournamentRpc('publish_draw', {
        p_event: data.event.id, p_draw: draw.id, p_expected: draw.updated_at,
        ...(hostEvent ? { p_draw_token: draw._review_token, rotation: isRotation(draw.format) } : {}),
    }),
    saveSchedule: (data, plan) => tournamentRpc('save_schedule', { p_event: data.event.id, p_expected: data.schedule?.revision || 0, p_source: data.sourceFingerprint, p_assignments: plan.assignments, p_fixtures: plan.fixtures, p_settings: plan.settings }),
    publishSchedule: data => tournamentRpc('publish_schedule', { p_event: data.event.id, p_expected: data.schedule.revision }),
    result: (data, match, result) => tournamentRpc('record_result', { p_event: data.event.id, p_match: match.id, p_expected: match.updated_at, p_result: result }),
    finalise: (data, division) => tournamentRpc('finalise', { p_event: data.event.id, p_division: division }),
    access: (data, email, capabilities) => tournamentRpc('set_access', { p_event: data.event.id, p_email: email, p_capabilities: capabilities }),
};

}
