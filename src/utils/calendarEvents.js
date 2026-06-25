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
        .select('id, event_name, start_date, end_date')
        .neq('is_visible', false)
        .order('start_date', { ascending: true });

    if (error) throw error;
    return filterUpcomingEvents(data);
}
