import { fetchAllRows } from './fetchAllRows.js';

/** Count active player entries, including pending payments, without the API row cap. */
export async function fetchEventEntryCounts(supabase, eventIds) {
    const ids = [...new Set(eventIds)];
    const counts = {};

    for (let start = 0; start < ids.length; start += 100) {
        const batch = ids.slice(start, start + 100);
        const registrations = await fetchAllRows(() => supabase
            .from('event_registrations_public')
            .select('id, event_id')
            .in('event_id', batch)
            .order('id', { ascending: true }), 500);

        for (const registration of registrations) {
            counts[registration.event_id] = (counts[registration.event_id] || 0) + 1;
        }
    }

    return counts;
}

/** Upcoming = visible events whose end date (or start date) is today or later. */
export function filterUpcomingEvents(events) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    return (events || []).filter((event) => {
        const endDateStr = event.end_date || event.start_date;
        if (!endDateStr) return false;
        const eventEnd = new Date(endDateStr);
        eventEnd.setHours(23, 59, 59, 999);
        return eventEnd >= startOfToday;
    });
}

export async function fetchUpcomingCalendarEvents(supabase) {
    const { data, error } = await supabase
        .from('calendar')
        .select('id, event_name, start_date, end_date, allow_temporary_license')
        .neq('is_visible', false)
        .order('start_date', { ascending: true });

    if (error) throw error;
    return filterUpcomingEvents(data);
}
