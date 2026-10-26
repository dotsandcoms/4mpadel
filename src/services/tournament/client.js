import { supabase } from '../../supabaseClient';

export async function tournamentRpc(name, args = {}) {
    const { data, error } = await supabase.rpc(`tm_${name}`, args);
    if (error) {
        if (error.code === 'PGRST202' || error.code === '42883' || error.code === '42P01') throw new Error('Tournament Manager needs its database migrations. You can review existing records now; workflow updates need the documented database migration.');
        throw new Error(error.message);
    }
    return data;
}
export const tournamentClient = {
    saveRegistration: (data, division, registration, payload) => tournamentRpc('save_registration', { p_event: data.event.id, p_division: division, p_registration: registration?.id || null, p_payload: payload, p_expected: registration?._revision || null }),
    saveDivision: (data, division, name, active) => tournamentRpc('save_division', { p_event: data.event.id, p_division: division, p_name: name, p_active: active }),
    qualify: (data, draw, matches) => tournamentRpc('qualify', { p_event: data.event.id, p_draw: draw.id, p_expected: draw.updated_at, p_matches: matches }),
    list: () => tournamentRpc('list_events'),
    load: eventId => tournamentRpc('snapshot', { p_event: eventId }),
    saveSettings: (data, settings, days) => tournamentRpc('save_settings', { p_event: data.event.id, p_expected: data.settingsRevision, p_settings: settings, p_days: days }),
    confirm: (data, division, kind, payload) => tournamentRpc('confirm', { p_event: data.event.id, p_division: division, p_kind: kind, p_payload: payload, p_expected: data.confirmations.find(c => c.division_id === division)?.revision || 0 }),
    saveDraw: (data, division, draw) => tournamentRpc('save_draw', { p_event: data.event.id, p_division: division, p_expected: data.confirmations.find(c => c.division_id === division)?.revision || 0, p_draw: draw }),
    publishDraw: (data, draw) => tournamentRpc('publish_draw', { p_event: data.event.id, p_draw: draw.id, p_expected: draw.updated_at }),
    saveSchedule: (data, plan) => tournamentRpc('save_schedule', { p_event: data.event.id, p_expected: data.schedule?.revision || 0, p_source: data.sourceFingerprint, p_assignments: plan.assignments, p_fixtures: plan.fixtures, p_settings: plan.settings }),
    publishSchedule: data => tournamentRpc('publish_schedule', { p_event: data.event.id, p_expected: data.schedule.revision }),
    result: (data, match, result) => tournamentRpc('record_result', { p_event: data.event.id, p_match: match.id, p_expected: match.updated_at, p_result: result }),
    finalise: (data, division) => tournamentRpc('finalise', { p_event: data.event.id, p_division: division }),
    access: (data, email, capabilities) => tournamentRpc('set_access', { p_event: data.event.id, p_email: email, p_capabilities: capabilities }),
};
