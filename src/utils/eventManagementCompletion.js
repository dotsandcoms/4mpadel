import { fetchAllRows } from './fetchAllRows.js';

export function partitionManagedEvents(events) {
    const activeEvents = [];
    const completedEvents = [];
    for (const event of events) {
        (event.management_completed_at ? completedEvents : activeEvents).push(event);
    }
    return { activeEvents, completedEvents };
}

const dayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg' });
const eventDay = (value) => {
    if (!value) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : dayFormatter.format(date);
};

export function managedEventStage(event, now = new Date()) {
    if (event.management_completed_at) return 'Completed';
    const today = dayFormatter.format(now);
    const start = eventDay(event.start_date);
    const end = eventDay(event.end_date) || start;
    if (!start) return 'Active';
    if (start > today) return 'Upcoming';
    return end >= today ? 'In progress' : 'Awaiting completion';
}

export async function loadManagedEventCompletions(client) {
    const rows = await fetchAllRows(() => client.from('event_management_completion')
        .select('event_id, completed_at').order('event_id', { ascending: true }));
    return new Map(rows.map((row) => [Number(row.event_id), row.completed_at]));
}

export async function setManagedEventCompleted(client, event, completed) {
    const { data, error } = await client.rpc('set_event_management_completed', {
        p_event_id: event.id,
        p_completed: completed,
        p_expected_completed_at: event.management_completed_at || null,
    });
    if (error) throw error;
    if (!data || Number(data.event_id) !== Number(event.id)) throw new Error('Could not confirm the event status. Please refresh and try again.');
    return data;
}
