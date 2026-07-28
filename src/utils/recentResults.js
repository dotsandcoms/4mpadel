/** SAPA tiers that auto-enter Recent Results once the event has finished. */
export const RECENT_RESULTS_AUTO_TIERS = ['Gold', 'Super Gold', 'S Gold', 'Major'];

/**
 * @param {string|null|undefined} status
 */
export function isRecentResultsAutoTier(status) {
    return RECENT_RESULTS_AUTO_TIERS.includes(String(status || '').trim());
}

/**
 * Event is finished after its end date (or start date) calendar day has passed.
 * @param {{ end_date?: string|null, start_date?: string|null }} event
 * @param {Date} [now]
 */
export function isCalendarEventFinished(event, now = new Date()) {
    const endDateStr = event?.end_date || event?.start_date;
    if (!endDateStr) return false;
    const end = new Date(`${String(endDateStr).slice(0, 10)}T23:59:59.999`);
    if (Number.isNaN(end.getTime())) return false;
    return end < now;
}

/**
 * Promote finished Gold / Super Gold / Major events into Recent Results.
 * Prefers the SECURITY DEFINER RPC when available; falls back to a direct update.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<number>} number of rows updated when known, otherwise 0
 */
export async function promoteFinishedTiersToRecentResults(supabase) {
    try {
        const { data, error } = await supabase.rpc('promote_finished_tier_recent_results');
        if (!error) return Number(data) || 0;
        // RPC may not be deployed yet — fall through to direct update.
        if (error.code !== 'PGRST202' && error.code !== '42883') {
            console.warn('promote_finished_tier_recent_results RPC:', error.message || error);
        }
    } catch (err) {
        console.warn('promote_finished_tier_recent_results RPC failed:', err);
    }

    try {
        const today = new Date().toISOString().slice(0, 10);
        const { data: candidates, error: selectError } = await supabase
            .from('calendar')
            .select('id, start_date, end_date, sapa_status, featured_result, show_in_recent_results')
            .in('sapa_status', RECENT_RESULTS_AUTO_TIERS)
            .neq('is_visible', false)
            .or('featured_result.is.false,featured_result.is.null,show_in_recent_results.is.false,show_in_recent_results.is.null')
            .or(`end_date.lt.${today},and(end_date.is.null,start_date.lt.${today})`)
            .limit(200);

        if (selectError) throw selectError;

        const ids = (candidates || [])
            .filter((event) => isCalendarEventFinished(event) && isRecentResultsAutoTier(event.sapa_status))
            .filter((event) => !event.featured_result || !event.show_in_recent_results)
            .map((event) => event.id);

        if (!ids.length) return 0;

        const { data: updated, error: updateError } = await supabase
            .from('calendar')
            .update({
                featured_result: true,
                show_in_recent_results: true,
            })
            .in('id', ids)
            .select('id');

        if (updateError) throw updateError;
        return updated?.length || 0;
    } catch (err) {
        // Anon/public callers often cannot UPDATE calendar — homepage still merges finished tiers in JS.
        console.warn('Direct promoteFinishedTiersToRecentResults update skipped:', err?.message || err);
        return 0;
    }
}
