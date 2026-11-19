import { helpTicketFromSearch } from '../../utils/helpLinks';
import { useHelpUnread } from './useHelpUnread';
import React, { useState } from 'react';
import EventMessaging from './EventMessaging';
import EventFinance from './EventFinance';
import HelpRequestsAdmin from './HelpRequestsAdmin';
import PrivateDrawRehearsal, { PrivateRehearsalEvents } from './PrivateDrawRehearsal';
import { canSeePrivateRehearsal } from '../../utils/privateDrawRehearsal';

function EventManagementSections({ entries }) {
    const [section, setSection] = useState(() => {
        const requested = new URLSearchParams(window.location.search).get('section');
        return requested === 'help' || requested === 'messages' ? requested : 'entries';
    });
    const help = useHelpUnread();
    return <div className="space-y-6">
        <nav aria-label="Event management sections" className="flex flex-wrap gap-3">
            {[['entries', 'Entries & finances'], ['messages', 'Event messages'], ['help', 'Help requests']].map(([key, label]) =>
                <button type="button" key={key} aria-pressed={section === key} onClick={() => setSection(key)}
                    className={`min-h-11 rounded-xl border px-5 py-3 text-sm font-semibold ${section === key ? 'border-padel-green text-padel-green' : 'border-white/15 text-gray-400'}`}>{label}{key === 'help' && help.unread > 0 ? ` (${help.unread})` : ''}</button>)}
        </nav>
        {section === 'help' ? <HelpRequestsAdmin initialTicket={helpTicketFromSearch(window.location.search)} unread={help.unread} revision={help.revision} onChange={help.refresh} /> : section === 'messages' ? <EventMessaging /> : entries}
    </div>;
}

const EventManagement = ({ permissions, userEmail, entriesOnly = false, allowPlatformActions = true, ...eventProps }) => {
    const [rehearsalEventId, setRehearsalEventId] = useState(null);
    const canRehearse = allowPlatformActions && canSeePrivateRehearsal(userEmail, permissions);
    if (rehearsalEventId && canRehearse) return <PrivateDrawRehearsal eventId={rehearsalEventId} onClose={() => setRehearsalEventId(null)} />;
    if (permissions?.role === 'private_rehearsal') return <div className="space-y-5">
        {canRehearse ? <PrivateRehearsalEvents onStart={setRehearsalEventId} /> : <p role="alert">Private rehearsal access is required.</p>}
    </div>;
    const entries = <EventFinance {...eventProps} isEventManagementModule allowPlatformActions={allowPlatformActions} onStartRehearsal={canRehearse ? setRehearsalEventId : undefined} />;
    return entriesOnly ? entries : <EventManagementSections entries={entries} />;
};

export default EventManagement;
