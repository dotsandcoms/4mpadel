import { lazy, Suspense, useCallback } from 'react';
import { useMatch, useSearchParams } from 'react-router-dom';

const EventManagement = lazy(() => import('../../../components/admin/EventManagement'));
const CalendarManager = lazy(() => import('../../../components/admin/CalendarManager'));

function eventIdFromSearch(search) {
    const value = search.get('event');
    if (!value || !/^\d+$/.test(value)) return null;
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function CurrentEvents({ session, permissions, targetEmail, scopeId = 'all', page, refreshRevision }) {
    const [search] = useSearchParams();
    const tournamentRoute = useMatch('/admin-preview/tournaments');
    const allowedEvents = permissions?.module_permissions?.['event-mgmt']?.allowedEvents;
    const canAccess = permissions?.role === 'super_admin' || permissions?.allowed_tabs?.includes('event-mgmt') || allowedEvents?.length;
    if (!session?.user?.id || !canAccess) return <p role="alert">Event Manager access is required.</p>;

    const eventId = eventIdFromSearch(search);
    const registrationTab = page === 'registrations' ? 'list' : tournamentRoute ? 'draws' : undefined;

    return <Suspense fallback={<p role="status">Loading Event Manager…</p>}>
        <EventManagement
            key={`${session.user.id}:${scopeId}:${page}:${eventId}:${registrationTab}:${search.get('section')}:${search.get('ticket')}:${refreshRevision}`}
            allowedEvents={allowedEvents}
            permissions={permissions}
            userEmail={targetEmail || session.user.email}
            scopeId={scopeId}
            initialEventId={eventId}
            initialRegistrationTab={registrationTab}
        />
    </Suspense>;
}

export function CurrentCalendar({ session, permissions, scopeId = 'all', refreshRevision }) {
    const [search, setSearch] = useSearchParams();
    const clearAction = useCallback(() => {
        setSearch(current => {
            const next = new URLSearchParams(current);
            for (const key of ['create', 'editEvent', 'calendarEvent']) next.delete(key);
            return next;
        }, { replace: true });
    }, [setSearch]);
    if (!session?.user?.id || !(permissions?.role === 'super_admin' || permissions?.allowed_tabs?.includes('calendar'))) {
        return <p role="alert">Calendar access is required.</p>;
    }

    const create = search.get('create');
    const createMode = create === 'full' || create === 'quick' ? create : null;
    return <Suspense fallback={<p role="status">Loading Calendar…</p>}>
        <CalendarManager
            key={`${session.user.id}:${scopeId}:${refreshRevision}`}
            scopeId={scopeId}
            initialEditEventId={search.get('editEvent') || search.get('calendarEvent')}
            createMode={createMode}
            onRouteActionOpened={clearAction}
        />
    </Suspense>;
}
