import { useState } from 'react';
import { Search } from 'lucide-react';

// Local draft only. Empty selections retain FinanceManager's fallback semantics.
export default function FinanceEventAccess({ selected, events, loading, error, disabled, onChange, inheritedCount }) {
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const rows = editing ? events.filter(event => `${event.event_name} ${event.id}`.toLowerCase().includes(query.trim().toLowerCase())) : selected.map(id => events.find(event => String(event.id) === String(id)) || { id });
  const pages = Math.max(1, Math.ceil(rows.length / 4));
  const currentPage = Math.min(page, pages);
  return <div className="ax-finance-events">
    <h4>Finance event access</h4>
    <p>{selected.length ? `${selected.length} specific Finance events selected.` : inheritedCount ? `No Finance-specific restriction. The live module falls back to ${inheritedCount} Event Manager assignments.` : 'No Finance-specific restriction. The live module falls back to finance-managed events.'} Clearing this list does not block Finance access.</p>
    <p className="ax-note">This is a local draft of the stored event restriction, not a verified backend access decision.</p>
    {disabled && <p>Editing requires a super-admin operator, a custom user role and the Finance module enabled. Stored selections remain unchanged.</p>}
    {loading ? <p role="status">Loading events…</p> : error ? <p role="alert">Event details unavailable. Retry the access context lookup above.</p> : <>
      <button type="button" className="ap-secondary" disabled={disabled} aria-expanded={editing} onClick={() => { setEditing(value => !value); setQuery(''); setPage(1); }}>{editing ? 'Done · show Finance assignments' : 'Edit Finance event access'}</button>
      {editing && <label className="ax-search"><Search size={16} aria-hidden="true" /><input aria-label="Find a Finance event" placeholder="Find an event by name or ID" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></label>}
      <div className="ax-events ax-picker-results" aria-label="Finance event assignments">{rows.slice((currentPage - 1) * 4, currentPage * 4).map(event => editing ? <label key={event.id}><input type="checkbox" disabled={disabled} checked={selected.some(id => String(id) === String(event.id))} onChange={() => onChange(selected.some(id => String(id) === String(event.id)) ? selected.filter(id => String(id) !== String(event.id)) : [...selected, event.id])} /><span><b className="ax-policy-event-title">{event.event_name || `Event #${event.id}`}</b><small>Event #{event.id}{event.start_date ? ` · ${String(event.start_date).slice(0, 10)}` : ''}</small></span></label> : <div className="ax-membership" key={event.id}><span><b>{event.event_name || `Event #${event.id}`}</b><small>Event #{event.id}{!event.event_name ? ' · Details unavailable; assignment preserved' : ''}</small></span><span className="ap-status ap-status--info">Assigned</span></div>)}</div>
      {editing && !rows.length && <p role="status">No matching events. Try another name or ID.</p>}
      {rows.length > 0 && <nav className="ax-pagination" aria-label="Finance event pages"><span role="status">Showing {(currentPage - 1) * 4 + 1}–{Math.min(currentPage * 4, rows.length)} of {rows.length} events · Page {currentPage} of {pages}</span><button type="button" className="ap-secondary" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button><button type="button" className="ap-secondary" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Next</button></nav>}
    </>}
  </div>;
}
