import React from 'react';
import RecordLoading from './RecordLoading.jsx';
import './EventRecordState.css';

export default function EventRecordState({ loading, error }) {
  return <section className="ap-section ap-event-record-state">
    {loading ? <RecordLoading label="Loading authorised records…" detail="Loading the event and records available in your current workspace."/> : <div className="ap-event-record-message" role={error ? 'alert' : 'status'}>
      <h2>Record unavailable</h2>
      <p>{error || 'Select an event available in your current workspace.'}</p>
    </div>}
  </section>;
}
