import React, { useState } from 'react';
import EventMessaging from './EventMessaging';
import EventFinance from './EventFinance';

const EventManagement = ({ allowedEvents }) => {
    const [section, setSection] = useState('entries');
    return <div className="space-y-6">
        <nav aria-label="Event management sections" className="flex flex-wrap gap-3">
            {[['entries', 'Entries & finances'], ['messages', 'Event messages']].map(([key, label]) =>
                <button type="button" key={key} aria-pressed={section === key} onClick={() => setSection(key)}
                    className={`min-h-11 rounded-xl border px-5 py-3 text-sm font-semibold ${section === key ? 'border-padel-green text-padel-green' : 'border-white/15 text-gray-400'}`}>{label}</button>)}
        </nav>
        {section === 'messages' ? <EventMessaging /> : <EventFinance allowedEvents={allowedEvents} isEventManagementModule={true} />}
    </div>;
};

export default EventManagement;
