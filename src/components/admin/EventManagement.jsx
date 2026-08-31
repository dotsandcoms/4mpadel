import React from 'react';
import EventFinance from './EventFinance';

const EventManagement = ({ allowedEvents }) => {
    return (
        <EventFinance allowedEvents={allowedEvents} isEventManagementModule={true} />
    );
};

export default EventManagement;
