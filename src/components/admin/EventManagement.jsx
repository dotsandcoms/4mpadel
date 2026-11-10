import React, { useState } from 'react';
import EventMessaging from './EventMessaging';
import EventFinance from './EventFinance';
import PrivateDrawRehearsal, { PrivateRehearsalEvents } from './PrivateDrawRehearsal';
import { canSeePrivateRehearsal } from '../../utils/privateDrawRehearsal';

const EventManagement = ({ allowedEvents, permissions, userEmail }) => {
    const [section, setSection] = useState('entries');
    const [rehearsalEventId, setRehearsalEventId] = useState(null);
    const canRehearse = canSeePrivateRehearsal(userEmail, permissions);
    if (rehearsalEventId && canRehearse) return <PrivateDrawRehearsal eventId={rehearsalEventId} onClose={() => setRehearsalEventId(null)} />;
    if (permissions?.role === 'private_rehearsal') return <div className="space-y-5">
        <PrivateRehearsalEvents onStart={setRehearsalEventId} />
    </div>;
    return <div className="space-y-6">
        <nav aria-label="Event management sections" className="flex flex-wrap gap-3">
            {[['entries', 'Entries & finances'], ['messages', 'Event messages']].map(([key, label]) =>
                <button type="button" key={key} aria-pressed={section === key} onClick={() => setSection(key)}
                    className={`min-h-11 rounded-xl border px-5 py-3 text-sm font-semibold ${section === key ? 'border-padel-green text-padel-green' : 'border-white/15 text-gray-400'}`}>{label}</button>)}
        </nav>
        {section === 'messages' ? <EventMessaging /> : <EventFinance allowedEvents={allowedEvents} isEventManagementModule={true} onStartRehearsal={canRehearse ? setRehearsalEventId : undefined} />}
    </div>;
};

export default EventManagement;
