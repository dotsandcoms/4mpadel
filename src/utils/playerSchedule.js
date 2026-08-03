import { supabase } from '../supabaseClient';

export const SCHEDULE_CHANGED_EVENT = '4m:schedule-changed';

/**
 * Notify Hero / other listeners that the user's curated schedule changed.
 */
export function dispatchScheduleChanged() {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(SCHEDULE_CHANGED_EVENT));
}

/**
 * @param {string} email
 * @returns {Promise<number[]>} calendar event ids on the user's schedule
 */
export async function fetchScheduledEventIds(email) {
    if (!email) return [];
    const { data, error } = await supabase
        .from('player_schedule_events')
        .select('event_id')
        .ilike('user_email', email);
    if (error) throw error;
    return (data || []).map((row) => row.event_id).filter(Boolean);
}

/**
 * @param {string} email
 * @returns {Promise<object[]>} schedule rows with nested calendar event
 */
export async function fetchScheduledEventsWithCalendar(email) {
    if (!email) return [];
    const { data, error } = await supabase
        .from('player_schedule_events')
        .select('event_id, created_at, calendar(*)')
        .ilike('user_email', email)
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
}

/**
 * Add a calendar event to the user's My Schedule.
 * @param {string} email
 * @param {number|string} eventId
 */
export async function addEventToSchedule(email, eventId) {
    if (!email || eventId == null) throw new Error('Email and event are required');
    const numericId = Number(eventId);

    const { data: existing, error: lookupErr } = await supabase
        .from('player_schedule_events')
        .select('id')
        .ilike('user_email', email)
        .eq('event_id', numericId)
        .maybeSingle();
    if (lookupErr) throw lookupErr;
    if (existing) {
        dispatchScheduleChanged();
        return;
    }

    const { error } = await supabase
        .from('player_schedule_events')
        .insert({ user_email: email, event_id: numericId });
    if (error && error.code !== '23505') throw error;
    dispatchScheduleChanged();
}

/**
 * Remove a calendar event from the user's My Schedule.
 * @param {string} email
 * @param {number|string} eventId
 */
export async function removeEventFromSchedule(email, eventId) {
    if (!email || eventId == null) throw new Error('Email and event are required');
    const { error } = await supabase
        .from('player_schedule_events')
        .delete()
        .ilike('user_email', email)
        .eq('event_id', Number(eventId));
    if (error) throw error;
    dispatchScheduleChanged();
}

/**
 * Toggle whether an event is on the user's schedule.
 * @returns {Promise<boolean>} true if now on schedule
 */
export async function toggleEventOnSchedule(email, eventId, currentlyOnSchedule) {
    if (currentlyOnSchedule) {
        await removeEventFromSchedule(email, eventId);
        return false;
    }
    await addEventToSchedule(email, eventId);
    return true;
}
