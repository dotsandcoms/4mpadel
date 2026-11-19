import { lazy, Suspense, useCallback } from 'react';
import { useMatch, useSearchParams } from 'react-router-dom';
import { resolveEventWorkspace } from '../../../utils/adminCalendarScope';

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
    const rehearsalOnly = permissions?.role === 'private_rehearsal';
    const workspace = resolveEventWorkspace(permissions, scopeId, 'event-mgmt');
    if (!session?.user?.id || (!workspace && !rehearsalOnly)) return <p role="alert">Event Manager access is required.</p>;

    const eventId = eventIdFromSearch(search);
    const registrationTab = page === 'registrations' ? 'list' : tournamentRoute ? 'draws' : undefined;

    return <Suspense fallback={<p role="status">Loading Event Manager…</p>}>
        <EventManagement
            key={`${session.user.id}:${workspace?.scopeId}:${workspace?.allowedEvents.join(',')}:${workspace?.allowPlatformActions}:${page}:${eventId}:${registrationTab}:${refreshRevision}`}
            {...workspace}
            entriesOnly
            permissions={permissions}
            userEmail={targetEmail || session.user.email}
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
    const workspace = resolveEventWorkspace(permissions, scopeId, 'calendar');
    if (!session?.user?.id || !workspace) {
        return <p role="alert">Calendar access is required.</p>;
    }

    const create = search.get('create');
    const createMode = create === 'full' || create === 'quick' ? create : null;
    return <Suspense fallback={<p role="status">Loading Calendar…</p>}>
        <CalendarManager
            key={`${session.user.id}:${workspace.scopeId}:${workspace.allowedEvents.join(',')}:${workspace.allowPlatformActions}:${refreshRevision}`}
            {...workspace}
            initialEditEventId={search.get('editEvent') || search.get('calendarEvent')}
            createMode={createMode}
            onRouteActionOpened={clearAction}
        />
    </Suspense>;
}
