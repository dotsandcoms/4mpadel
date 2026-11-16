import { supabase } from '../supabaseClient';

export const helpStatusText = { open: 'Open', waiting_on_player: 'Awaiting player', resolved: 'Resolved' };
export const helpTopicText = { entry: 'Tournament or entry', payment: 'Payment or refund', profile: 'Profile, rankings or licence', problem: 'App problem', other: 'Other enquiry' };
export async function helpRequestApi(action, data = {}) {
    const result = await supabase.rpc('help_api', { p_action: action, p_data: data });
    if (result.error) {
        if (['PGRST202', '42883'].includes(result.error.code)) throw new Error('Help requests are awaiting their database deployment.');
        const text = result.error.message || '';
        throw new Error(/^(Sign in again|Choose a help|Choose an available|This (help|payment|event|entry|request|reply)|Write a message|You have reached|Please wait|Verify your authenticator)/.test(text) && text.length < 240 ? text : 'Help requests could not load or save. Please try again.');
    }
    return result.data;
}
