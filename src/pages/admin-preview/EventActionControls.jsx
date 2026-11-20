import SearchableDropdown from "../../components/SearchableDropdown";
import { useState } from 'react';
import { Search, ShieldCheck } from 'lucide-react';
import { EVENT_ACTIONS, EVENT_PRESETS, presetActions, checkProposedEventAction } from './eventActionPolicy';

export default function EventActionControls({ draft, policy, onChange, operator, events, loading, error }) {
  const [pendingPreset, setPendingPreset] = useState('');
  const [eventId, setEventId] = useState('');
  const [actionIds, setActionIds] = useState([EVENT_ACTIONS[0].id]);
  const [eventSearch, setEventSearch] = useState('');
  const [eventPage, setEventPage] = useState(1);
  const superAdmin = draft.role === 'super_admin';
  const editable = operator.role === 'super_admin' && !superAdmin;
  const checkedActions = EVENT_ACTIONS.filter(action => actionIds.includes(action.id));
  const selectedPreset = EVENT_PRESETS.find(item => item.id === pendingPreset);
  const activePreset = EVENT_PRESETS.find(item => EVENT_ACTIONS.every(action => policy[action.id] === (item.allowed.includes(action.id) ? 'allow' : 'deny')))?.id || '';
  const matchedEvents = events.filter(event => `${event.event_name} ${event.id}`.toLowerCase().includes(eventSearch.trim().toLowerCase()));
  const pageCount = Math.max(1, Math.ceil(matchedEvents.length / 4));
  const currentPage = Math.min(eventPage, pageCount);
  const visibleEvents = matchedEvents.slice((currentPage - 1) * 4, currentPage * 4);
  const selectedEvent = events.find(event => String(event.id) === eventId);
  return <section className="ax-block ax-action-policy">
    <div className="ax-policy-heading"><h3>05 · Event operations</h3><span className="ap-status ap-status--info">Proposed controls</span></div>
    <p>Define what this user should be able to change within their event access. These controls are a design preview and are not yet enforced by the live system.</p>
    {superAdmin ? <p className="ax-summary">Super admins have full access through their role. Event lifecycle checks still apply.</p> : <>
      {!editable && <p>Only a super admin can draft action policies in this batch.</p>}
      <label className="ax-label">Start from a preset<SearchableDropdown disabled={!editable} value={pendingPreset || activePreset} onChange={event => { if (!event.target.value) return; setPendingPreset(event.target.value); }}><option value="" disabled={Boolean(activePreset)}>Custom / existing rules</option>{EVENT_PRESETS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</SearchableDropdown></label>
      {selectedPreset && <div className="ax-preset-confirm"><b>{selectedPreset.label}</b><p>{selectedPreset.description}</p><p>This replaces the proposed action choices below. Module grants, event assignments and memberships stay as currently drafted.</p><div className="ax-actions"><button className="ap-secondary" onClick={() => setPendingPreset('')}>Cancel</button><button className="ap-primary" onClick={() => { onChange(presetActions(pendingPreset)); setPendingPreset(''); }}>Use preset in draft</button></div></div>}
      {['Event setup', 'Registrations', 'Live competition'].map(group => <details className="ax-action-group" key={group} open={group === 'Live competition'}><summary>{group}<span>{EVENT_ACTIONS.filter(action => action.group === group && policy[action.id] === 'allow').length} proposed allows</span></summary><div>{EVENT_ACTIONS.filter(action => action.group === group).map(action => <label className="ax-action-choice" key={action.id}><span><b>{action.label}</b><small>{action.detail}</small>{action.sensitive && <small className="ax-sensitive">Separate permission recommended</small>}</span><SearchableDropdown aria-label={action.label} disabled={!editable} value={policy[action.id] || 'existing'} onChange={event => { setPendingPreset(''); onChange({ ...policy, [action.id]: event.target.value }); }}><option value="existing">Existing rules</option><option value="allow">Allow in draft</option><option value="deny">Block in draft</option></SearchableDropdown></label>)}</div></details>)}
    </>}
    <details className="ax-action-group"><summary>Check a proposed action<span><ShieldCheck size={16} /></span></summary><div className="ax-policy-check">
      <p>Compare the draft against a specific event. This is a policy preview, not a live access test.</p>
      {loading ? <p role="status">Loading event context…</p> : error ? <p role="alert">Event context is unavailable. Retry the lookup above.</p> : <>
        <div className="ax-event-picker ax-policy-event-picker">
          <label className="ax-search"><Search size={18} aria-hidden="true" /><input aria-label="Find an event" value={eventSearch} onChange={event => { setEventSearch(event.target.value); setEventPage(1); }} placeholder="Find an event by name or ID" /></label>
          <p role="status">{matchedEvents.length ? `Showing ${(currentPage - 1) * 4 + 1}–${Math.min(currentPage * 4, matchedEvents.length)} of ${matchedEvents.length} matching events` : 'No matching events. Try another name or ID.'}</p>
          <div className="ax-events ax-picker-results" role="group" aria-label="Choose an event for the policy check">
            {visibleEvents.map(event => <label key={event.id}><input type="radio" name="policy-check-event" checked={eventId === String(event.id)} onChange={() => setEventId(String(event.id))} /><span><b className="ax-policy-event-title">{event.event_name || `Event #${event.id}`}</b><small>Event #{event.id}{event.start_date ? ` · ${event.start_date}` : ''}</small></span></label>)}
          </div>
          {matchedEvents.length > 4 && <nav className="ax-pagination" aria-label="Policy check event pages"><span>Page {currentPage} of {pageCount}</span><button type="button" className="ap-secondary" disabled={currentPage === 1} onClick={() => setEventPage(currentPage - 1)}>Previous</button><button type="button" className="ap-secondary" disabled={currentPage === pageCount} onClick={() => setEventPage(currentPage + 1)}>Next</button></nav>}
          {selectedEvent && <p className="ax-policy-selection">Selected for check: <strong>{selectedEvent.event_name || `Event #${selectedEvent.id}`}</strong> · Event #{selectedEvent.id}</p>}
        </div>
        <fieldset className="ax-check-actions">
          <legend>Actions to check</legend>
          <p>Select one or more actions. This checks the draft only; it does not grant access.</p>
          <div className="ax-check-toolbar">
            <span role="status">{actionIds.length} of {EVENT_ACTIONS.length} selected</span>
            <button type="button" className="ap-secondary" disabled={actionIds.length === EVENT_ACTIONS.length} onClick={() => setActionIds(EVENT_ACTIONS.map(action => action.id))}>Select all</button>
            <button type="button" className="ap-secondary" disabled={!actionIds.length} onClick={() => setActionIds([])}>Deselect all</button>
          </div>
          <div className="ax-check-grid">{EVENT_ACTIONS.map(action => <label key={action.id}><input type="checkbox" checked={actionIds.includes(action.id)} onChange={event => setActionIds(current => event.target.checked ? [...current, action.id] : current.filter(id => id !== action.id))} /><span>{action.label}</span></label>)}</div>
        </fieldset>
        <div className="ax-check-results" aria-live="polite">
          {!checkedActions.length ? <p>Select at least one action to see its result.</p> : !eventId ? <p>Choose an event to check the selected actions.</p> : checkedActions.map(action => {
            const result = checkProposedEventAction(draft, policy, eventId, action.id);
            return <div className="ax-summary" key={action.id}><b>{action.label}</b><p><strong>{({ blocked: 'Blocked in this draft', proposed: 'Proposed allow', unknown: 'Needs verification', override: 'Super-admin override' })[result.status]}</strong> · {result.reason}</p></div>;
          })}
        </div>
      </>}
    </div></details>
  </section>;
}
