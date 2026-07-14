import { supabase } from '../supabaseClient';

/**
 * Write an admin activity row for an event (requires Event Manager access).
 * DB triggers already cover register / withdraw / move / payment status —
 * use this for richer admin notes when needed.
 *
 * @param {object} params
 * @param {string} params.eventId
 * @param {string} params.action
 * @param {string} params.category
 * @param {string} params.summary
 * @param {object} [params.details]
 * @param {string} [params.actorRole]
 */
export async function logEventActivity({
    eventId,
    action,
    category = 'ADMIN',
    summary,
    details = {},
    actorRole = 'ADMIN',
}) {
    if (!eventId || !action || !summary) return null;
    try {
        const { data, error } = await supabase.rpc('log_event_activity', {
            p_event_id: Number(eventId),
            p_action: action,
            p_category: category,
            p_summary: summary,
            p_details: details,
            p_actor_role: actorRole,
        });
        if (error) {
            // Migration may not be applied yet — don't block admin UX
            console.warn('logEventActivity failed:', error.message);
            return null;
        }
        return data;
    } catch (err) {
        console.warn('logEventActivity failed:', err);
        return null;
    }
}
