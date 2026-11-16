import React from 'react';
export default function EventAudience({ audience, selected, onChange, loading, disabled }) {
    const segmented = Array.isArray(selected);
    return <fieldset className="em-audience" disabled={disabled}><legend>Send to</legend>
        <label className={!segmented ? 'is-selected' : ''}><input type="radio" name="em-audience-mode" checked={!segmented} onChange={() => onChange(null)} /><span>All registered players<small>{audience ? `${audience.allCount.toLocaleString('en-ZA')} eligible app accounts` : 'Checking audience…'}</small></span></label>
        <label className={segmented ? 'is-selected' : ''}><input type="radio" name="em-audience-mode" checked={segmented} onChange={() => onChange([])} /><span>Selected divisions<small>Choose one or more divisions</small></span></label>
        {segmented && <div className="em-division-options">{audience?.divisions?.map(division => <label key={division.id}><input type="checkbox" checked={selected.includes(division.id)} onChange={event => onChange(event.target.checked ? [...selected, division.id].sort() : selected.filter(id => id !== division.id))} /><span>{division.name}</span><b aria-label={`${division.count} eligible app accounts`}>{division.count.toLocaleString('en-ZA')}</b></label>)}{audience && !audience.divisions.length && <p>This event has no divisions yet.</p>}</div>}
        <p className="em-audience-summary" role="status">{loading ? 'Updating audience…' : !audience ? 'Audience unavailable. Refresh to try again.' : segmented && !selected.length ? 'Select at least one division.' : `${segmented ? audience.selectedCount : audience.allCount} eligible app accounts · each player receives one copy`}</p>
        {segmented && <p className="em-audience-note">Only players with verified entries in these divisions can see this announcement. Counts show app accounts, not total registrations.{audience?.unassignedCount > 0 ? ` ${audience.unassignedCount} event accounts have no verified division link and are included only in event-wide announcements.` : ''}</p>}
    </fieldset>;
}
